import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { projects, user as userTable } from "@/lib/db/schema";
import { getProjectHeader, listAssignableUsers } from "@/lib/projects/queries";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import {
  getOrCreateProjectRights,
  listHoldersWithContacts,
  listLicenseFeePayments,
} from "@/lib/rights/queries";
import { listProjectSurfaceNotes } from "@/lib/projects/surface-notes-queries";
import { listAttachments } from "@/lib/files/queries";
import { listThreads } from "@/lib/email/queries";
import { listObligations } from "@/lib/obligations/queries";
import { RightsPanel } from "@/components/rights/rights-manager";
import { ComplianceCard } from "@/components/rights/compliance-card";
import { ProjectCorrespondence } from "@/components/rights/project-correspondence";
import { ProjectSurfaceNotes } from "@/components/projects/project-surface-notes";
import { getAgreementChatSnapshot } from "@/lib/agreement-chat/actions";

export const metadata = { title: "Rights" };
export const dynamic = "force-dynamic";

export default async function ProjectRightsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user } = await requireUser();
  const project = await getProjectHeader(slug);
  if (!project) notFound();

  const canEdit = can(user, "rights.edit");
  const rights = await getOrCreateProjectRights(project.id, user.id);
  const [
    { holders, contacts },
    users,
    attachments,
    feePayments,
    [creator],
    rightsNotes,
    obligations,
    mentionTargets,
    agreementChat,
  ] = await Promise.all([
      listHoldersWithContacts(),
      listAssignableUsers(),
      listAttachments("rights_item", rights.id),
      listLicenseFeePayments(project.id),
      db
        .select({ id: userTable.id, name: userTable.name })
        .from(projects)
        .leftJoin(userTable, eq(userTable.id, projects.createdBy))
        .where(eq(projects.id, project.id))
        .limit(1),
      listProjectSurfaceNotes(project.id, "rights"),
      listObligations(project.id),
      listProjectMentionTargets(project.id),
      getAgreementChatSnapshot(project.id),
    ]);
  const threads = canEdit
    ? await listThreads({ projectId: project.id, limit: 20 })
    : [];

  return (
    <div className="space-y-6">
    <RightsPanel
      projectId={project.id}
      slug={slug}
      rights={{
        ...rights,
        mouSignedDate: rights.mouSignedDate,
        licenseSignedDate: rights.licenseSignedDate,
        rightsStartDate: rights.rightsStartDate,
        completeByDate: rights.completeByDate,
      }}
      holders={holders.map((h) => ({ id: h.id, name: h.name }))}
      contacts={contacts.map((c) => ({
        id: c.id,
        holderId: c.holderId,
        name: c.name,
      }))}
      users={users.map((u) => ({ id: u.id, name: u.name }))}
      attachments={attachments}
      canEdit={canEdit}
      feePayments={feePayments.map((p) => ({
        id: p.id,
        period: p.period,
        amount: p.amount,
        currency: p.currency,
        dueDate: p.dueDate,
        assigneeName: p.assigneeName,
        taskId: p.taskId,
        paidAt: p.paidAt,
        receipts: p.receipts,
      }))}
      creatorName={creator?.name ?? null}
      agreementChat={agreementChat}
    />
      <ComplianceCard
        projectId={project.id}
        canEdit={canEdit}
        obligations={obligations}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        territory={rights.territory}
        defaultAssigneeId={creator?.id ?? null}
      />
      <ProjectSurfaceNotes
        projectId={project.id}
        slug={slug}
        surface="rights"
        title="Rights notes"
        emptyText="No rights notes yet."
        currentUserId={user.id}
        canModerate={canEdit}
        members={mentionTargets}
        notes={rightsNotes.map((note) => ({
          id: note.id,
          userId: note.userId,
          authorName: note.authorName,
          body: note.body,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
          replies: note.replies.map((reply) => ({
            id: reply.id,
            userId: reply.userId,
            authorName: reply.authorName,
            body: reply.body,
            createdAt: reply.createdAt.toISOString(),
            updatedAt: reply.updatedAt.toISOString(),
          })),
        }))}
      />
      {canEdit ? <ProjectCorrespondence threads={threads} /> : null}
    </div>
  );
}
