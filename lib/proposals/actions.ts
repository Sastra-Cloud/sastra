"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  emailThreads,
  files,
  projects,
  proposalSubmissions,
  rightsItems,
} from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { getBudgetData } from "@/lib/budget/queries";
import {
  buildAllocatedQuotationBuffer,
  buildPartnerQuotationBuffer,
  buildQuotationBuffer,
} from "@/lib/budget/quotation-file";
import { buildPerCopyQuotationPdf } from "@/lib/budget/pdf";
import { budgetApprovalTotal } from "@/lib/budget/approval-fingerprint";
import { partnerQuotePrices } from "@/lib/budget/print-options";
import { draftWithAi } from "@/lib/print/actions";
import { sendEmail } from "@/lib/gmail";
import { buildKey, putObject } from "@/lib/r2";
import { logActivity } from "@/lib/activity/log";
import { currentBudgetApprovalAuthorization } from "@/lib/budget/approval-service";
import { fundingProposalFallback } from "@/lib/email/operational-drafts";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { removeEmailDraftForUser } from "@/lib/email/draft-store";

import {
  PartnerQuotationError,
  partnerQuotationVersion,
} from "@/lib/budget/partner-quotations";
import { listPartnerQuotations } from "@/lib/budget/partner-quotation-queries";
import { getPartnerQuotationContext } from "@/lib/budget/partner-quotation-context";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (value: string) => EMAIL_RE.test(value.trim());

function moneyLabel(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

async function proposalContext(
  projectId: string,
  printRunId?: string | null,
  quotationId?: string | null,
) {
  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      slug: projects.slug,
      kind: projects.kind,
      proposedCompletionDate: projects.proposedCompletionDate,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
  // The agreement's real deadline (from a signed license/MoU), if any. Its
  // presence means we no longer offer a self-proposed completion date.
  const [rights] = await db
    .select({ completeByDate: rightsItems.completeByDate })
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  const { settings, items, presentation } = await getBudgetData(
    projectId,
    printRunId ?? undefined,
  );
  let allocation: Awaited<ReturnType<typeof getPartnerQuotationContext>> | null;
  try {
    allocation = quotationId
      ? await getPartnerQuotationContext(projectId, printRunId, quotationId)
      : null;
  } catch (error) {
    if (error instanceof PartnerQuotationError) return { error: error.message };
    throw error;
  }
  const total =
    allocation?.total ?? Number(budgetApprovalTotal(items, presentation));
  return {
    project,
    settings: allocation?.settings ?? settings,
    total,
    items: allocation?.items ?? items,
    presentation: allocation ? { mode: "itemized" as const, printOptions: allocation.printOptions ?? [] } : presentation,
    allocation,
    realCompletionDeadline: rights?.completeByDate ?? null,
  };
}

export async function draftMouProposal(
  projectId: string,
  printRunId?: string | null,
  quotationId?: string | null,
) {
  const { user: actor } = await requireRole("manager");
  const [ctx, workspace] = await Promise.all([
    proposalContext(projectId, printRunId, quotationId),
    getWorkspaceSettings(),
  ]);
  if (!ctx) return { error: "Project not found." };
  if ("error" in ctx) return { error: ctx.error };
  const { project, settings, total, presentation, realCompletionDeadline } =
    ctx;
  const currency = settings.currency || "USD";
  const printOptions =
    presentation?.mode === "itemized" ? presentation.printOptions : [];
  const { baseCents } = partnerQuotePrices(ctx.items, printOptions);
  const totalLabel = printOptions?.length
    ? `funding from ${moneyLabel(total, currency)}, depending on the print quantity chosen`
    : moneyLabel(total, currency);
  const firstName = settings.partnerContactFirstName ?? null;
  const fullName =
    [settings.partnerContactFirstName, settings.partnerContactLastName]
      .filter(Boolean)
      .join(" ") || null;

  // Offer our proposed completion date only while there's no signed agreement.
  // Once the license/MoU sets a real deadline, that governs and we don't propose
  // one of our own.
  const proposedCompletionLabel =
    !realCompletionDeadline && project.proposedCompletionDate
      ? formatDate(project.proposedCompletionDate)
      : null;

  const draft = await draftWithAi({
    purpose:
      "Propose a funding partnership to a partner and invite them to review the attached budget quotation. The partner may fund it through an MoU, by agreeing without an MoU, or by giving a donation.",
    fallback: fundingProposalFallback({
      recipientFirstName: firstName,
      projectTitle: project.title,
      totalLabel,
      scopeLabel: ctx.allocation?.quote.title,
      completionLabel: proposedCompletionLabel,
      senderName: actor.name,
      organizationName: workspace.orgName?.trim() || "Sastra workspace",
    }),
    actorUserId: actor.id,
    projectId,
    operation: "draft_mou_proposal",
    entityType: "project",
    entityId: projectId,
    feature: "budget",
    context: {
      sponsor: settings.partnerName,
      contactFirstName: firstName,
      projectTitle: project.title,
      workDescription: settings.workDescription,
      includedWork: ctx.allocation?.quote.lines.map((line) => ({
        work: line.label,
        amount: moneyLabel(line.amountCents / 100, currency),
      })),
      scopeInstructions: ctx.allocation
        ? "Ask only for this partner’s listed share. Other work on the project is outside this proposal."
        : undefined,
      totalAmount: totalLabel,
      ...(printOptions?.length
        ? {
            printingChoices: printOptions.map((option) => ({
              quantity: option.quantity,
              projectPrice: moneyLabel(
                (baseCents + option.partnerAmountCents) / 100,
                currency,
              ),
            })),
            printingChoiceInstructions:
              "These are alternative quantities. Ask the partner to choose one. Do not add prices together or present a single agreed total.",
          }
        : {}),
      currency,
      ...(proposedCompletionLabel
        ? { proposedCompletionDate: proposedCompletionLabel }
        : {}),
      attachment:
        presentation?.mode === "per_copy"
          ? "the partner quotation PDF is attached"
          : "the partner-safe project quotation spreadsheet (.xlsx) is attached",
      senderName: actor.name,
      organizationName: workspace.orgName?.trim() || "Sastra workspace",
      requestedTone:
        "Warm, concise, and appreciative. State the requested amount and project first, identify the attached quotation, and give the concrete next step: reply to say how they would like to proceed (we can prepare an MoU, they can agree by email, or they can give a donation) or reply with changes. Do not assume an MoU is required." +
        (proposedCompletionLabel
          ? ` Offer ${proposedCompletionLabel} as our proposed completion date for the work, framed as our target timeline.`
          : ""),
    },
  });

  return {
    subject: draft.subject,
    body: draft.body,
    recipientEmail: settings.partnerContactEmail ?? "",
    recipientName: fullName ?? settings.partnerName ?? "",
    defaultCcEmails: workspace.defaultCcEmails,
  };
}

const proposedDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .nullable();

/** Set (or clear) the project's proposed completion date used in proposals. */
export async function updateProposedCompletionDate(
  projectId: string,
  value: string | null,
): Promise<{ error?: string }> {
  await requireRole("manager");
  const normalized = value && value.length > 0 ? value : null;
  const parsed = proposedDateSchema.safeParse(normalized);
  if (!parsed.success) return { error: "Enter a valid date." };
  const [project] = await db
    .update(projects)
    .set({ proposedCompletionDate: parsed.data, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ slug: projects.slug });
  if (project) revalidatePath(`/projects/${project.slug}/budget`);
  return {};
}

const sendSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  ccEmails: z.array(z.string()).optional(),
  quotationFingerprint: z.string().max(100000).optional(),
});

export async function sendMouProposal(
  projectId: string,
  input: z.input<typeof sendSchema>,
  printRunId?: string | null,
  quotationId?: string | null,
): Promise<{
  error?: string;
  proposal?: {
    id: string;
    recipientName: string | null;
    recipientEmail: string;
    subject: string;
    currency: string;
    totalAmount: string;
    budgetApprovalRequestId: string | null;
    fileId: string | null;
    status: string;
    sentAt: string;
    sentByName: string | null;
  };
}> {
  const { user: actor } = await requireRole("manager");
  const data = sendSchema.parse(input);
  if (
    !quotationId &&
    (await listPartnerQuotations(projectId, printRunId)).length
  )
    return {
      error:
        "Choose a partner quotation in Partners & proposals before sending.",
    };
  const ctx = await proposalContext(projectId, printRunId, quotationId);
  if (!ctx) return { error: "Project not found." };
  if ("error" in ctx) return { error: ctx.error };
  const { project, settings, presentation, total } = ctx;
  const allocationVersion = ctx.allocation
    ? partnerQuotationVersion(ctx.allocation.quote)
    : null;
  if (allocationVersion && data.quotationFingerprint !== allocationVersion)
    return {
      error:
        "This partner quotation changed. Close and review the proposal again before sending.",
    };

  if (quotationId && !settings.partnerName?.trim()) return { error: "Choose a partner or enter a partner name in this quotation before sending." };
  const to = (settings.partnerContactEmail ?? "").trim();
  if (!isEmail(to)) {
    return {
      error: quotationId
        ? "Add a valid contact email in this partner quotation first."
        : "Add a valid funding contact email in Quotation settings first.",
    };
  }
  const cc = [
    ...new Set(
      (data.ccEmails ?? [])
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const badCc = cc.find((email) => !isEmail(email));
  if (badCc) return { error: `Check CC email: ${badCc}` };

  const approval = await currentBudgetApprovalAuthorization(
    projectId,
    printRunId,
    quotationId,
  );
  if (!approval.ok) return { error: approval.error };
  const approvedTotal = total;
  const approvedCurrency = approval.snapshot.currency;

  // Build and persist the exact quotation file that gets sent (for history).
  const workspace = await getWorkspaceSettings();
  const perCopy = presentation?.mode === "per_copy";
  if (
    perCopy &&
    (!(presentation?.perCopyQuantity && presentation.perCopyQuantity > 0) ||
      !(Number(presentation.perCopyUnitPrice) > 0))
  ) {
    return {
      error:
        "Set a copy quantity and partner price per copy before sending the proposal.",
    };
  }
  let buffer: Buffer;
  try {
    buffer = quotationId
      ? await buildAllocatedQuotationBuffer(
          projectId,
          project.title,
          quotationId,
          printRunId ?? undefined,
          project.kind,
        )
      : perCopy
        ? await buildPerCopyQuotationPdf({
            issuerName: workspace.legalName || workspace.orgName,
            accentColor: workspace.accentColor,
            projectTitle: project.title,
            partnerName: settings.partnerName,
            contactName:
              [
                settings.partnerContactFirstName,
                settings.partnerContactLastName,
              ]
                .filter(Boolean)
                .join(" ") || null,
            description:
              presentation.publicDescription ||
              settings.workDescription ||
              project.title,
            quantity: presentation.perCopyQuantity ?? 0,
            unitPrice: Number(presentation.perCopyUnitPrice ?? 0),
            currency: settings.currency,
          })
        : presentation
          ? await buildPartnerQuotationBuffer(
              projectId,
              project.title,
              printRunId ?? undefined,
              project.kind,
            )
          : await buildQuotationBuffer(
              projectId,
              project.title,
              printRunId ?? undefined,
              project.kind,
            );
  } catch (error) {
    if (error instanceof PartnerQuotationError) return { error: error.message };
    throw error;
  }
  // Recompute immediately after building the attachment. A quotation edit that
  // raced the first check must not authorize a file from a different budget.
  const confirmedApproval = await currentBudgetApprovalAuthorization(
    projectId,
    printRunId,
    quotationId,
  );
  if (
    !confirmedApproval.ok ||
    confirmedApproval.requestId !== approval.requestId ||
    confirmedApproval.fingerprint !== approval.fingerprint
  ) {
    return {
      error: confirmedApproval.ok
        ? "The budget or its approval requirements changed while preparing the proposal. Try again."
        : confirmedApproval.error,
    };
  }
  const fileId = randomUUID();
  const filename = `${project.slug}-partner-quotation.${
    perCopy ? "pdf" : "xlsx"
  }`;
  const mimeType = perCopy ? PDF_MIME : XLSX_MIME;
  const key = buildKey(fileId, filename);
  await putObject(key, buffer, mimeType);
  await db.insert(files).values({
    id: fileId,
    r2Key: key,
    originalName: filename,
    mimeType,
    sizeBytes: buffer.length,
    status: "ready",
    uploadedBy: actor.id,
  });

  // This is the final server-side gate immediately before the external send.
  // The earlier check protects attachment generation; this one protects the
  // irreversible email side effect if the budget changed during file storage.
  const sendApproval = await currentBudgetApprovalAuthorization(
    projectId,
    printRunId,
    quotationId,
  );
  if (
    !sendApproval.ok ||
    sendApproval.requestId !== approval.requestId ||
    sendApproval.fingerprint !== approval.fingerprint
  ) {
    return {
      error: sendApproval.ok
        ? "The budget or its approval requirements changed before the email was sent. Try again."
        : sendApproval.error,
    };
  }

  try {
    if (quotationId) {
      const latest = await getPartnerQuotationContext(
        projectId,
        printRunId,
        quotationId,
      );
      if (partnerQuotationVersion(latest.quote) !== allocationVersion)
        return {
          error:
            "The partner quotation changed before sending. Review the proposal again.",
        };
    }
  } catch (error) {
    if (error instanceof PartnerQuotationError) return { error: error.message };
    throw error;
  }
  let res;
  try {
    res = await sendEmail({
      to: [to],
      cc,
      subject: data.subject,
      bodyText: data.body,
      attachments: [{ filename, content: buffer, contentType: mimeType }],
      actingUserId: actor.id,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Email was not sent.",
    };
  }

  let emailThreadId: string | null = null;
  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.gmailThreadId, res.threadKey))
    .limit(1);
  if (thread) {
    emailThreadId = thread.id;
    await db
      .update(emailThreads)
      .set({ projectId, linkedManually: true, updatedAt: new Date() })
      .where(eq(emailThreads.id, thread.id));
  }

  const recipientName =
    [settings.partnerContactFirstName, settings.partnerContactLastName]
      .filter(Boolean)
      .join(" ") ||
    settings.partnerName ||
    null;
  const [submission] = await db
    .insert(proposalSubmissions)
    .values({
      projectId,
      printRunId: printRunId ?? null,
      partnerQuotationId: quotationId ?? null,
      sentByUserId: actor.id,
      partnerName: settings.partnerName?.trim() || null,
      partnerId: settings.partnerId ?? null,
      recipientName,
      recipientEmail: to,
      ccEmails: cc.length ? cc : null,
      subject: data.subject,
      currency: approvedCurrency,
      totalAmount: approvedTotal.toFixed(2),
      budgetApprovalRequestId: approval.requestId,
      budgetApprovalFingerprint: approval.approvalRequired
        ? approval.fingerprint
        : null,
      fileId,
      emailThreadId,
      status: "sent",
    })
    .returning({
      id: proposalSubmissions.id,
      sentAt: proposalSubmissions.sentAt,
    });

  await logActivity({
    actorId: actor.id,
    projectId,
    entityType: "budget",
    action: "proposal",
    summary: `Sent funding proposal to ${to} (${moneyLabel(
      approvedTotal,
      approvedCurrency,
    )})`,
  });
  await removeEmailDraftForUser(
    actor.id,
    "funding_proposal",
    quotationId ?? printRunId ?? projectId,
  );
  revalidatePath(`/projects/${project.slug}/budget`);
  return {
    proposal: {
      id: submission.id,
      recipientName,
      recipientEmail: to,
      subject: data.subject,
      currency: approvedCurrency,
      totalAmount: approvedTotal.toFixed(2),
      budgetApprovalRequestId: approval.requestId,
      fileId,
      status: "sent",
      sentAt: submission.sentAt.toISOString(),
      sentByName: actor.name,
    },
  };
}
