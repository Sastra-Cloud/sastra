import { formatInTimeZone } from "date-fns-tz";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { documentImports, projects, sharedMouGroups, user } from "@/lib/db/schema";
import { PageShell, PageHero } from "@/components/cockpit";
import { FundingReview } from "@/components/agreements/funding-review";
import { RetryImportButton } from "@/components/imports/retry-import-button";

export default async function FundingReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  await requireRole("manager");
  const { importId } = await params;
  const [[review], options, owners] = await Promise.all([
    db.select().from(documentImports).where(eq(documentImports.id, importId)).limit(1),
    db.select({ id: projects.id, title: projects.title, createdBy: projects.createdBy, dueDate: projects.dueDate }).from(projects).orderBy(projects.title),
    db.select({ id: user.id, name: user.name }).from(user).where(and(eq(user.isActive, true), eq(user.isBot, false), inArray(user.role, ["manager", "admin", "super_admin"]))),
  ]);
  if (!review?.fundingSourceKey) notFound();
  if (review.status === "committed") {
    const [group] = await db.select({ id: sharedMouGroups.id }).from(sharedMouGroups).where(eq(sharedMouGroups.sourceImportId, importId)).limit(1);
    if (group) redirect(`/agreements/${group.id}`);
  }
  const workspace = await getWorkspaceSettings();
  const today = formatInTimeZone(new Date(), workspace.timezone, "yyyy-MM-dd");
  const extraction = review.reviewed ?? review.extraction;
  return <PageShell>
    <PageHero title="Review MoU funding" />
    <p className="text-sm text-muted-foreground">Verify the source amounts, processing contact, dates, and delivery clauses. Existing project budgets, rights, and deadlines are preserved.</p>
    <nav aria-label="Funding source" className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2 text-sm">
    {review.sourceThreadId ? <Link href={`/correspondence/${review.sourceThreadId}`} className="inline-flex min-h-9 items-center text-primary underline underline-offset-4">Source correspondence</Link> : null}
    {review.fileId ? <Link href={`/api/files/${review.fileId}/download`} target="_blank" className="inline-flex min-h-9 items-center text-primary underline underline-offset-4">Open source document</Link> : null}
    </nav>
    {extraction && review.status === "extracted" && extraction.documentKind === "agreement" && extraction.agreementType !== "license_only" && extraction.mouPaymentSchedule.length > 0 ? <FundingReview today={today} importId={importId} extraction={extraction} projects={options} owners={owners} /> :
      <div className="space-y-3"><p>{review.error ?? (review.status === "extracted" ? "No incoming agreement funding was detected. Check the source document before retrying extraction." : "Extraction is in progress. Refresh this page when it finishes.")}</p><RetryImportButton importId={importId} /></div>}
  </PageShell>;
}
