"use server";

import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import {
  EMAIL_DRAFT_KINDS,
  type EmailDraftKind,
} from "@/lib/email/draft-types";
import {
  removeEmailDraftForUser,
  saveEmailDraftForUser,
} from "@/lib/email/draft-store";

const saveDraftSchema = z.object({
  evidence: z.array(z.object({ requirement: z.string().max(500), url: z.string().max(4000), fileId: z.string().uuid().optional() })).max(30).optional(),
  projectId: z.uuid().nullable(),
  kind: z.enum(EMAIL_DRAFT_KINDS),
  contextId: z.uuid(),
  toAddresses: z.array(z.email()).max(50),
  ccAddresses: z.array(z.email()).max(50),
  subject: z.string().max(998),
  body: z.string().max(100_000),
  baselineSubject: z.string().max(998).nullable(),
  baselineBody: z.string().max(100_000).nullable(),
});

export async function saveEmailDraft(input: z.input<typeof saveDraftSchema>) {
  const session = await requireRole("manager");
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the draft fields and try again." };
  const draft = await saveEmailDraftForUser(session.user.id, parsed.data);
  return { draft };
}

export async function discardEmailDraft(
  kind: EmailDraftKind,
  contextId: string
) {
  const session = await requireRole("manager");
  const parsed = z
    .object({ kind: z.enum(EMAIL_DRAFT_KINDS), contextId: z.uuid() })
    .safeParse({ kind, contextId });
  if (!parsed.success) return { error: "That email draft is not valid." };
  await removeEmailDraftForUser(
    session.user.id,
    parsed.data.kind,
    parsed.data.contextId
  );
  return {};
}
