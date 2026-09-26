"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { aiStructured } from "@/lib/ai/openrouter";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  emailFollowUps,
  emailMessages,
  emailThreadProjects,
  emailThreads,
  projects,
} from "@/lib/db/schema";
import { buildExternalEmailDraftMessages } from "@/lib/email/operational-drafts";
import { emailAnalysisText } from "@/lib/email/body-segments";
import { getCaptureMailbox } from "@/lib/gmail";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  resolveFollowUpRecord,
  snoozeFollowUpRecord,
} from "./follow-ups";

const idSchema = z.string().uuid();
const snoozeSchema = z.object({
  id: z.string().uuid(),
  businessDays: z.number().int().refine((value) => [1, 3, 5].includes(value)),
});

async function revalidateFollowUp(id: string) {
  const [row] = await db
    .select({ threadId: emailFollowUps.threadId })
    .from(emailFollowUps)
    .where(eq(emailFollowUps.id, id))
    .limit(1);
  if (!row) return;
  revalidatePath(`/correspondence/${row.threadId}`);
  revalidatePath("/tasks");
  const linked = await db
    .select({ slug: projects.slug })
    .from(emailThreadProjects)
    .innerJoin(projects, eq(projects.id, emailThreadProjects.projectId))
    .where(eq(emailThreadProjects.threadId, row.threadId));
  for (const project of linked) revalidatePath(`/projects/${project.slug}`);
}

export async function snoozeExternalFollowUp(input: {
  id: string;
  businessDays: number;
}) {
  await requireRole("manager");
  const parsed = snoozeSchema.parse(input);
  const until = await snoozeFollowUpRecord(parsed.id, parsed.businessDays);
  await revalidateFollowUp(parsed.id);
  return { until };
}

export async function resolveExternalFollowUp(id: string) {
  await requireRole("manager");
  const followUpId = idSchema.parse(id);
  await resolveFollowUpRecord(followUpId);
  await revalidateFollowUp(followUpId);
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: { type: "string", minLength: 1, maxLength: 300 },
    body: { type: "string", minLength: 1, maxLength: 8_000 },
  },
} as const;

export async function draftExternalFollowUp(id: string) {
  const { user } = await requireRole("manager");
  const followUpId = idSchema.parse(id);
  const [followUp] = await db
    .select({
      id: emailFollowUps.id,
      threadId: emailFollowUps.threadId,
      summary: emailFollowUps.summary,
      counterparty: emailFollowUps.counterparty,
      subject: emailThreads.subject,
    })
    .from(emailFollowUps)
    .innerJoin(emailThreads, eq(emailThreads.id, emailFollowUps.threadId))
    .where(eq(emailFollowUps.id, followUpId))
    .limit(1);
  if (!followUp) throw new Error("Follow-up not found.");
  const [settings, messages] = await Promise.all([
    getWorkspaceSettings(),
    db
      .select({
        direction: emailMessages.direction,
        fromAddr: emailMessages.fromAddr,
        body: emailMessages.bodyText,
      })
      .from(emailMessages)
      .where(eq(emailMessages.threadId, followUp.threadId))
      .orderBy(asc(emailMessages.sentAt)),
  ]);
  const recipient =
    followUp.counterparty ??
    [...messages].reverse().find((message) => message.direction === "inbound")
      ?.fromAddr ??
    "the external recipient";
  const prompt = buildExternalEmailDraftMessages({
    senderName: user.name,
    organizationName: settings.orgName ?? settings.legalName ?? "the organization",
    from: (await getCaptureMailbox()) ?? settings.contactEmail ?? "the shared mailbox",
    to: recipient,
    intent: `Politely follow up on this outstanding response: ${followUp.summary}. Ask for a brief update. Do not invent a deadline or imply urgency.`,
    threadSubject: followUp.subject,
    threadMessages: messages
      .filter((message) => message.body)
      .slice(-8)
      .map((message) => ({
        direction: message.direction,
        fromAddr: message.fromAddr,
        body: emailAnalysisText({
          subject: followUp.subject,
          text: message.body,
        }).slice(0, 4_000),
      })),
  });
  const result = (await aiStructured(
    "email_draft",
    prompt,
    { name: "external_follow_up_draft", schema: DRAFT_SCHEMA },
    {
      metering: {
        scope: "workspace",
        actorUserId: user.id,
        feature: "correspondence",
        operation: "draft_external_follow_up",
        taskKey: "email_draft",
        entityType: "email_follow_up",
        entityId: followUp.id,
      },
      timeoutMs: 45_000,
    }
  )) as { subject?: string; body?: string };
  return {
    subject: String(result.subject ?? "").trim(),
    body: String(result.body ?? "").trim(),
  };
}
