import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { getThread, listPendingProjectSuggestions } from "@/lib/email/queries";
import { listProjectsForImportMatch } from "@/lib/imports/queries";
import { matchGrantProjects } from "@/lib/imports/match";
import { getPossibleCounterpartySuggestion } from "@/lib/notifications/queries";
import { ContentColumn, PageHero, PageShell } from "@/components/cockpit";
import { ProjectSuggestionReview } from "@/components/correspondence/project-suggestion-review";

export const metadata = { title: "Review new projects" };
export const dynamic = "force-dynamic";

export default async function ReviewProjectsPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const { user } = await requireRole("manager");
  const [data, suggestions, existingProjects, counterparty] = await Promise.all([
    getThread(threadId),
    listPendingProjectSuggestions(threadId),
    listProjectsForImportMatch(),
    getPossibleCounterpartySuggestion(user.id, threadId),
  ]);
  if (!data) notFound();
  const { thread } = data;

  // If this email is from a funder who already funds existing projects, those
  // "new projects" are almost certainly that grant's existing work — warn.
  const funderName =
    thread.partnerName ??
    (counterparty?.type === "funding_partner" ? counterparty.name : null);
  const grant = funderName
    ? matchGrantProjects(funderName, null, existingProjects)
    : null;
  const grantMatch =
    grant && grant.siblings.length > 0
      ? { funderName: funderName!, projects: grant.siblings }
      : null;

  return (
    <PageShell>
      <div>
        <Link
          href={`/correspondence/${threadId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to email
        </Link>
      </div>

      <PageHero
        icon={<Sparkles className="size-6" />}
        eyebrow="AI suggestion"
        title="Review new projects"
        description={
          suggestions.length
            ? `${suggestions.length} project${
                suggestions.length === 1 ? "" : "s"
              } detected in “${thread.subject ?? "this email"}”. Edit and create the ones you want.`
            : `No projects are waiting for review on “${thread.subject ?? "this email"}”.`
        }
      />

      <ContentColumn width="reading">
        <ProjectSuggestionReview
          threadId={threadId}
          suggestions={suggestions}
          existingProjects={existingProjects}
          grantMatch={grantMatch}
        />
      </ContentColumn>
    </PageShell>
  );
}
