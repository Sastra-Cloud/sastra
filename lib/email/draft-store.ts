import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { emailDrafts } from "@/lib/db/schema";
import type {
  EmailDraftDTO,
  EmailDraftKind,
  SaveEmailDraftInput,
} from "./draft-types";

function serializeDraft(
  draft: typeof emailDrafts.$inferSelect
): EmailDraftDTO {
  return {
    evidence: draft.evidence ?? undefined,
    id: draft.id,
    projectId: draft.projectId,
    kind: draft.kind as EmailDraftKind,
    contextId: draft.contextId,
    toAddresses: draft.toAddresses,
    ccAddresses: draft.ccAddresses,
    subject: draft.subject,
    body: draft.body,
    baselineSubject: draft.baselineSubject,
    baselineBody: draft.baselineBody,
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export async function getEmailDraftForUser(
  userId: string,
  kind: EmailDraftKind,
  contextId: string
) {
  const [draft] = await db
    .select()
    .from(emailDrafts)
    .where(
      and(
        eq(emailDrafts.userId, userId),
        eq(emailDrafts.kind, kind),
        eq(emailDrafts.contextId, contextId)
      )
    )
    .limit(1);
  return draft ? serializeDraft(draft) : null;
}

export async function listEmailDraftsForProject(
  userId: string,
  projectId: string
) {
  const drafts = await db
    .select()
    .from(emailDrafts)
    .where(
      and(
        eq(emailDrafts.userId, userId),
        eq(emailDrafts.projectId, projectId)
      )
    )
    .orderBy(desc(emailDrafts.updatedAt));
  return drafts.map(serializeDraft);
}

export async function saveEmailDraftForUser(
  userId: string,
  input: SaveEmailDraftInput
) {
  const [draft] = await db
    .insert(emailDrafts)
    .values({
      userId,
      projectId: input.projectId,
      kind: input.kind,
      contextId: input.contextId,
      toAddresses: input.toAddresses,
      ccAddresses: input.ccAddresses,
      evidence: input.evidence ?? null,
      subject: input.subject,
      body: input.body,
      baselineSubject: input.baselineSubject,
      baselineBody: input.baselineBody,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        emailDrafts.userId,
        emailDrafts.kind,
        emailDrafts.contextId,
      ],
      set: {
        projectId: input.projectId,
        toAddresses: input.toAddresses,
        ccAddresses: input.ccAddresses,
        evidence: input.evidence ?? null,
      subject: input.subject,
        body: input.body,
        baselineSubject: input.baselineSubject,
        baselineBody: input.baselineBody,
        updatedAt: new Date(),
      },
    })
    .returning();
  return serializeDraft(draft);
}

export async function removeEmailDraftForUser(
  userId: string,
  kind: EmailDraftKind,
  contextId: string
) {
  await db
    .delete(emailDrafts)
    .where(
      and(
        eq(emailDrafts.userId, userId),
        eq(emailDrafts.kind, kind),
        eq(emailDrafts.contextId, contextId)
      )
    );
}
