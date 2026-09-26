import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentImports } from "@/lib/db/schema";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Mail, Sparkles } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import {
  getThread,
  listPendingProjectSuggestions,
  listThreadProjects,
} from "@/lib/email/queries";
import { canSendAsCorrespondenceAddress } from "@/lib/gmail";
import { listAssignableUsers, listProjects } from "@/lib/projects/queries";
import { ContentColumn, PageHero, PageShell } from "@/components/cockpit";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThreadControls } from "@/components/correspondence/thread-controls";
import { ThreadMessageList } from "@/components/correspondence/thread-message-list";
import { ThreadReply } from "@/components/correspondence/thread-reply";
import {
  getPossibleCounterpartySuggestion,
  getPossibleGrantReminderSuggestion,
} from "@/lib/notifications/queries";
import { listPendingEmailTaskSuggestionsForThread } from "@/lib/email/task-suggestions";
import { EmailTaskSuggestions } from "@/components/tasks/email-task-suggestions";
import { projectOptionLabel } from "@/lib/projects/visibility";
import { getThreadExternalFollowUp } from "@/lib/email/follow-ups";
import { ExternalFollowUpCard } from "@/components/correspondence/external-follow-up-card";
import { EmailRightsReviews } from "@/components/correspondence/email-rights-reviews";
import {
  listEmailRightsReviewOptions,
  listEmailRightsReviews,
} from "@/lib/email/rights-review";
import { listProjectUpdateSuggestions } from "@/lib/email/project-update-suggestions";
import { ProjectUpdateSuggestions } from "@/components/correspondence/project-update-suggestions";
import { listPartnersWithContacts } from "@/lib/partners/queries";
import { getEmailDraftForUser } from "@/lib/email/draft-store";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export const metadata = { title: "Thread" };
export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const { user } = await requireRole("manager");
  const [
    data,
    threadProjects,
    pendingSuggestions,
    counterpartySuggestion,
    grantReminderSuggestion,
    emailTaskSuggestions,
    externalFollowUp,
    rightsReviews,
    rightsReviewOptions,
    projectUpdateSuggestions,
    replyDraft,
    workspaceSettings,
    fundingReviews,
  ] = await Promise.all([
    getThread(threadId),
    listThreadProjects(threadId),
    listPendingProjectSuggestions(threadId),
    getPossibleCounterpartySuggestion(user.id, threadId),
    getPossibleGrantReminderSuggestion(user.id, threadId),
    listPendingEmailTaskSuggestionsForThread(threadId),
    getThreadExternalFollowUp(threadId),
    listEmailRightsReviews(threadId),
    listEmailRightsReviewOptions(threadId),
    listProjectUpdateSuggestions(threadId),
    getEmailDraftForUser(user.id, "thread_reply", threadId),
    getWorkspaceSettings(),
    db.select({ id: documentImports.id, status: documentImports.status, extraction: documentImports.extraction }).from(documentImports).where(eq(documentImports.sourceThreadId, threadId)),
  ]);
  if (!data) notFound();
  const { thread, messages } = data;

  const recipient =
    [...messages].reverse().find((m) => m.direction === "inbound")?.fromAddr ??
    messages.find((m) => m.fromAddr)?.fromAddr ??
    null;

  const [ps, us, partnerDirectory] = await Promise.all([
    listProjects(),
    listAssignableUsers(),
    listPartnersWithContacts(),
  ]);
  const projects = ps.map((project) => ({
    id: project.id,
    label: projectOptionLabel(project),
  }));
  const users = us.map((u) => ({ id: u.id, label: u.name }));

  const canSend = await canSendAsCorrespondenceAddress();
  return (
    <PageShell>
      <div>
        <Link
          href="/correspondence"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to inbox
        </Link>
      </div>

      <PageHero
        icon={<Mail className="size-6" />}
        eyebrow={
          threadProjects.length ? (
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              {threadProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.slug}`}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open project ${project.title}`}
                >
                  <span className="truncate">{project.title}</span>
                  <ArrowUpRight className="size-3.5 shrink-0" />
                </Link>
              ))}
            </span>
          ) : (
            "Unlinked"
          )
        }
        title={thread.subject ?? "(no subject)"}
        description={[
          thread.holderName,
          thread.partnerName,
          `Status: ${thread.status}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <ContentColumn width="reading" className="space-y-6">
        <div
          id="correspondence-review-results"
          className="space-y-6 scroll-mt-24"
        >
          {pendingSuggestions.length > 0 ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {pendingSuggestions.length === 1
                        ? "AI found a possible new project in this email"
                        : `AI found ${pendingSuggestions.length} possible new projects in this email`}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {pendingSuggestions.map((s) => s.title).join(" · ")}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/correspondence/${thread.id}/review`}
                  className={buttonVariants({ size: "sm" })}
                >
                  <Sparkles className="size-4" />
                  Review{" "}
                  {pendingSuggestions.length === 1 ? "project" : "projects"}
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <ProjectUpdateSuggestions suggestions={projectUpdateSuggestions} />

          <EmailTaskSuggestions
            initialSuggestions={emailTaskSuggestions}
            assignees={us.map((item) => ({ id: item.id, name: item.name }))}
            projects={ps.map((project) => ({
              id: project.id,
              name: projectOptionLabel(project),
            }))}
            currentUserId={user.id}
            canManage
          />

          {fundingReviews.filter((review) => !review.extraction || (review.extraction.documentKind === "agreement" && review.extraction.agreementType !== "license_only" && review.extraction.mouPaymentSchedule.length > 0)).map((review) => <Card key={review.id}><CardContent className="py-4">
            <Link href={`/agreements/review/${review.id}`} className="font-medium text-primary underline">{review.status === "committed" ? "View approved MoU funding" : "Review MoU funding"}</Link>
            <p className="text-sm text-muted-foreground">{review.status === "committed" ? "Funding approved. Open the shared schedule and invoice owner." : review.status === "extracted" ? "Verify the shared schedule and invoice owner." : review.status === "failed" ? "Extraction failed. Open the review to retry." : "Reading the funding document…"}</p>
          </CardContent></Card>)}
          <EmailRightsReviews
            reviews={rightsReviews}
            holders={rightsReviewOptions.holders}
            payments={rightsReviewOptions.payments}
            projects={threadProjects.map((project) => ({
              id: project.id,
              title: project.title,
            }))}
          />

          {externalFollowUp ? (
            <ExternalFollowUpCard
              followUp={externalFollowUp}
              allowProjectUpdate
            />
          ) : null}

          <Card>
            <CardContent className="py-4">
              <ThreadControls
                threadId={thread.id}
                subject={thread.subject}
                counterpartySuggestion={counterpartySuggestion}
                grantReminderSuggestion={grantReminderSuggestion}
                status={thread.status}
                threadProjects={threadProjects}
                assigneeId={thread.assigneeId}
                projects={projects}
                users={users}
                fundingPartners={partnerDirectory.partners.map((partner) => ({
                  id: partner.id,
                  label: partner.name,
                  contactEmails: partnerDirectory.contacts
                    .filter((contact) => contact.partnerId === partner.id)
                    .map((contact) => contact.email)
                    .filter((email): email is string => !!email),
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <ThreadMessageList messages={messages} threadId={thread.id} />

        {canSend && recipient && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Reply</CardTitle>
            </CardHeader>
            <CardContent>
            <ThreadReply
              threadId={thread.id}
              recipient={recipient}
              followUpId={externalFollowUp?.id}
              initialDraft={replyDraft}
              projectId={thread.projectId}
              defaultCcEmails={workspaceSettings.defaultCcEmails}
            />
            </CardContent>
          </Card>
        )}
      </ContentColumn>
    </PageShell>
  );
}
