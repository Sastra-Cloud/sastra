"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  budgetApprovalAssignments,
  budgetApprovalRequests,
  tasks,
  budgetItems,
  budgetScopePresentations,
  partners,
  printRuns,
  projectBudgetSettings,
  projectPartnerQuotations,
  projects,
} from "@/lib/db/schema";
import { findOrCreatePartnerContact } from "@/lib/partners/find-or-create";
import { partnerBaseItems } from "./print-options";
import { budgetApprovalFingerprint } from "./approval-fingerprint";
import { syncBudgetApprovalState } from "./approval-service";
import {
  PartnerQuotationError,
  partnerQuotationSchema,
  reviewQuotationLines,
  reviewQuotationPrintOptions,
  type PartnerQuotationInput,
} from "./partner-quotations";

export async function savePartnerQuotation(raw: PartnerQuotationInput) {
  const { user } = await requireRole("manager");
  const parsed = partnerQuotationSchema.safeParse(raw);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Check the quotation details.",
    };
  const input = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`partner-quotations:${input.projectId}`}))`,
      );
      const [project] = await tx
        .select({ slug: projects.slug })
        .from(projects)
        .where(eq(projects.id, input.projectId));
      if (!project) throw new PartnerQuotationError("Project not found.");
      if (input.printRunId) {
        const [run] = await tx
          .select({ id: printRuns.id })
          .from(printRuns)
          .where(
            and(
              eq(printRuns.id, input.printRunId),
              eq(printRuns.projectId, input.projectId),
              eq(printRuns.kind, "reprint"),
            ),
          );
        if (!run)
          throw new PartnerQuotationError(
            "Choose a reprint from this project.",
          );
      }
      if (input.partnerId) {
        const [partner] = await tx
          .select({ id: partners.id })
          .from(partners)
          .where(eq(partners.id, input.partnerId));
        if (!partner)
          throw new PartnerQuotationError(
            "Choose an existing partner or enter the partner name.",
          );
      }
      const scope = input.printRunId;
      const [settings] = await tx
        .select()
        .from(projectBudgetSettings)
        .where(eq(projectBudgetSettings.projectId, input.projectId));
      const items = await tx
        .select()
        .from(budgetItems)
        .where(
          and(
            eq(budgetItems.projectId, input.projectId),
            scope
              ? eq(budgetItems.printRunId, scope)
              : isNull(budgetItems.printRunId),
          ),
        )
        .orderBy(
          budgetItems.group,
          budgetItems.sortOrder,
          budgetItems.createdAt,
        );
      const [presentation] = await tx
        .select()
        .from(budgetScopePresentations)
        .where(
          and(
            eq(budgetScopePresentations.projectId, input.projectId),
            scope
              ? eq(budgetScopePresentations.printRunId, scope)
              : isNull(budgetScopePresentations.printRunId),
          ),
        );
      if (!settings)
        throw new PartnerQuotationError("Set up the project quotation first.");
      const others = await tx
        .select()
        .from(projectPartnerQuotations)
        .where(
          and(
            eq(projectPartnerQuotations.projectId, input.projectId),
            scope
              ? eq(projectPartnerQuotations.printRunId, scope)
              : isNull(projectPartnerQuotations.printRunId),
          ),
        );
      // An ID from another project or scope must never overwrite its quotation.
      const [existing] = await tx
        .select()
        .from(projectPartnerQuotations)
        .where(eq(projectPartnerQuotations.id, input.id));
      if (
        existing &&
        (existing.projectId !== input.projectId ||
          existing.printRunId !== scope)
      )
        throw new PartnerQuotationError(
          "This quotation belongs to another budget.",
        );
      const { projectId, printRunId, ...fields } = input;
      const quote = {
        ...fields,
        currency: settings.currency,
        lines: reviewQuotationLines(
          input.lines,
          partnerBaseItems(items, presentation?.printOptions),
          others.filter((q) => q.id !== input.id),
        ),
        printOptions: reviewQuotationPrintOptions(
          input.printOptions ?? [],
          presentation?.printOptions ?? [],
          others.filter((q) => q.id !== input.id),
          settings.currency,
        ),
        sourceFingerprint: budgetApprovalFingerprint(
          settings,
          items,
          presentation,
        ),
        updatedAt: new Date(),
      };
      // A typed name is a reusable partner, not just a quotation snapshot.
      // Resolve it after validating the share and in the same transaction, so
      // failed saves leave neither orphan partners nor contacts behind.
      quote.partnerId = null;
      if (input.partnerName) {
        const link = await findOrCreatePartnerContact(tx, {
          org: input.partnerName,
          partnerId: input.partnerId,
          // Preserve the full name entered on the proposal.
          firstName: input.contactName,
          email: input.contactEmail,
          createdBy: user.id,
        });
        quote.partnerId = link.partnerId;
      }
      if (existing)
        await tx
          .update(projectPartnerQuotations)
          .set(quote)
          .where(eq(projectPartnerQuotations.id, input.id));
      else
        await tx
          .insert(projectPartnerQuotations)
          .values({ ...quote, projectId, printRunId });
      return { quotation: quote, slug: project.slug };
    });
    await syncBudgetApprovalState(input.projectId, input.printRunId);
    await syncBudgetApprovalState(input.projectId, input.printRunId, input.id);
    revalidatePath(`/projects/${result.slug}/budget`);
    revalidatePath("/settings/partners");
    return { quotation: result.quotation };
  } catch (error) {
    return {
      error:
        error instanceof PartnerQuotationError
          ? error.message
          : "Could not save. Your details are still here. Try again.",
    };
  }
}

export async function deletePartnerQuotation(
  projectId: string,
  quotationId: string,
) {
  await requireRole("manager");
  try {
    const removed = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`partner-quotations:${projectId}`}))`,
      );
      const reviewTasks = await tx
        .select({ id: budgetApprovalAssignments.taskId })
        .from(budgetApprovalAssignments)
        .innerJoin(
          budgetApprovalRequests,
          eq(budgetApprovalRequests.id, budgetApprovalAssignments.requestId),
        )
        .where(
          and(
            eq(budgetApprovalRequests.partnerQuotationId, quotationId),
            eq(budgetApprovalRequests.projectId, projectId),
          ),
        );
      if (reviewTasks.length)
        await tx.delete(tasks).where(
          inArray(
            tasks.id,
            reviewTasks.map((task) => task.id),
          ),
        );
      const [row] = await tx
        .delete(projectPartnerQuotations)
        .where(
          and(
            eq(projectPartnerQuotations.id, quotationId),
            eq(projectPartnerQuotations.projectId, projectId),
          ),
        )
        .returning({ printRunId: projectPartnerQuotations.printRunId });
      return row;
    });
    if (!removed)
      return { error: "Quotation not found. Refresh and try again." };
    await syncBudgetApprovalState(projectId, removed.printRunId);
    const [project] = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (project) revalidatePath(`/projects/${project.slug}/budget`);
    return {};
  } catch {
    return { error: "Could not delete the quotation. Refresh and try again." };
  }
}
