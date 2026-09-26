import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft, Layers } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects, rightsItems } from "@/lib/db/schema";
import {
  countPendingUpdateImports,
  getImport,
  listProjectsForImportMatch,
} from "@/lib/imports/queries";
import {
  getProjectBudget,
  listInvoices,
  listPayments,
} from "@/lib/budget/queries";
import { sumAmountCents } from "@/lib/budget/compute";
import {
  ImportReview,
  type UpdateTarget,
} from "@/components/imports/import-review";
import { ContentColumn, PageShell } from "@/components/cockpit";

export const metadata = { title: "Review import" };
export const dynamic = "force-dynamic";

/** Build the existing-project context shown when an import is in update mode. */
async function loadTarget(
  projectId: string,
  preferredPaymentId: string | null
): Promise<UpdateTarget | null> {
  const [header] = await db
    .select({ slug: projects.slug, title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!header) return null;

  const [items, rights, payments, invoiceRows] = await Promise.all([
    getProjectBudget(projectId),
    db
      .select({ overallStatus: rightsItems.overallStatus })
      .from(rightsItems)
      .where(eq(rightsItems.projectId, projectId))
      .limit(1),
    listPayments(projectId),
    listInvoices(projectId),
  ]);
  const invoiceByPayment = new Map(
    invoiceRows
      .filter((invoice) => invoice.mouPaymentId)
      .map((invoice) => [invoice.mouPaymentId!, invoice])
  );

  const currency = items[0]?.currency ?? "USD";
  const total = (sumAmountCents(items) / 100).toFixed(2);
  return {
    projectId,
    slug: header.slug,
    title: header.title,
    budgetLineCount: items.length,
    budgetTotal: `${currency} ${total}`,
    rightsStatus: (rights[0]?.overallStatus ?? "none").replace("_", " "),
    preferredPaymentId,
    payments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      dueDate: payment.dueDate,
      notes: payment.notes,
      paidAt: payment.paidAt?.toISOString() ?? null,
      invoiceNumber:
        invoiceByPayment.get(payment.id)?.invoiceNumber ?? null,
    })),
  };
}

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  await requireRole("manager");
  const { importId } = await params;
  const imp = await getImport(importId);
  if (!imp) notFound();
  if (imp.fundingSourceKey) redirect(`/agreements/review/${importId}`);

  const target = imp.targetProjectId
    ? await loadTarget(imp.targetProjectId, imp.targetMouPaymentId)
    : null;
  // In create mode, load existing projects (with partner + budget total) so the
  // review can flag duplicates and offer to attach a grant/MoU to the projects a
  // proposal already created.
  const existingProjects = target ? [] : await listProjectsForImportMatch();
  // In update mode, how many more documents are queued for the same project.
  const queuedCount =
    target && imp.targetProjectId
      ? await countPendingUpdateImports(imp.targetProjectId, imp.id)
      : 0;

  return (
    <PageShell className="space-y-5">
      <Link
        href={target ? `/projects/${target.slug}` : "/projects/import"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {target ? target.title : "All imports"}
      </Link>
      <ContentColumn width="focused" className="space-y-5">
        {target && queuedCount > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm">
            <Layers className="mt-0.5 size-4 shrink-0 text-info" />
            <p className="text-muted-foreground">
              {queuedCount} more document{queuedCount === 1 ? "" : "s"} queued for{" "}
              <span className="font-medium text-foreground">{target.title}</span>.
              You&apos;ll review each in turn — applying this one opens the next.
            </p>
          </div>
        ) : null}
        <ImportReview
          importId={imp.id}
          fileName={imp.fileName}
          status={imp.status}
          error={imp.error}
          errorKind={imp.errorKind}
          learnFromReview={imp.learnFromReview}
          initial={imp.reviewed ?? imp.extraction ?? null}
          committedProjectIds={imp.committedProjectIds ?? []}
          target={target}
          existingProjects={existingProjects}
        />
      </ContentColumn>
    </PageShell>
  );
}
