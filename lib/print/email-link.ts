import "server-only";

import { and, desc, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  emailThreads,
  printContacts,
  printRuns,
  printThreadLinks,
  projectPrintSettings,
  projects,
} from "@/lib/db/schema";
import { extractLatestProofUrl } from "@/lib/print/parser";
import { ensureThreadProjectLink } from "@/lib/email/thread-projects";
import {
  deterministicKnownProjectMatch,
  matchKnownProject,
} from "@/lib/email/known-project-match";

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() || null : null;
}

function normalizedHaystack(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join("\n").toLowerCase();
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = value?.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized || null;
}

function looksLikePrintMessage(input: {
  subject?: string | null;
  bodyText?: string | null;
}): boolean {
  const haystack = normalizedHaystack([input.subject, input.bodyText]);
  if (!haystack) return false;
  const hits = [
    "print quote",
    "printer quote",
    "quotation",
    "invoice",
    "pdf proof",
    "trim size",
    "text paper",
    "cover:",
    "binding",
    "gsm",
    "woodfree",
    "lamination",
    "copies",
    "cps",
    "per copy",
    "per cpy",
    "deliver to foshan",
    "smyth",
    "paper back",
    "paperback",
  ].filter((term) => haystack.includes(term)).length;
  return hits >= 3 || (/\b(print|printer|invoice|quotation)\b/.test(haystack) && hits >= 2);
}

async function findPrintContact(input: {
  participantEmails: string[];
  participantNames?: string[];
}) {
  const { participantEmails, participantNames = [] } = input;
  const emails = new Set(participantEmails.map((e) => e.toLowerCase()));
  const domains = new Set(
    [...emails].map(domainOf).filter((d): d is string => !!d)
  );
  const names = new Set(
    participantNames.map(normalizeName).filter((n): n is string => !!n)
  );
  const contacts = await db
    .select()
    .from(printContacts)
    .where(eq(printContacts.isActive, true));
  return (
    contacts.find((c) => c.email && emails.has(c.email.toLowerCase())) ??
    contacts.find((c) => c.domain && domains.has(c.domain.toLowerCase())) ??
    contacts.find(
      (c) => c.email && domains.has(domainOf(c.email.toLowerCase()) ?? "")
    ) ??
    contacts.find((c) => {
      const contactNames = [c.name, c.company]
        .map(normalizeName)
        .filter((n): n is string => !!n);
      return contactNames.some((name) => names.has(name));
    }) ??
    null
  );
}

async function inferProjectId(input: {
  existingProjectId?: string | null;
  contactId?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  includeQuotedHistory?: boolean;
}) {
  if (input.existingProjectId) return input.existingProjectId;
  const [rows, defaults, runs] = await Promise.all([
    db
      .select({ id: projects.id, title: projects.title, slug: projects.slug })
      .from(projects),
    input.contactId
      ? db
          .select({ projectId: projectPrintSettings.projectId })
          .from(projectPrintSettings)
          .where(eq(projectPrintSettings.defaultContactId, input.contactId))
      : Promise.resolve([]),
    input.contactId
      ? db
          .select({ projectId: printRuns.projectId })
          .from(printRuns)
          .where(eq(printRuns.contactId, input.contactId))
      : Promise.resolve([]),
  ]);
  const relatedIds = new Set([
    ...defaults.map((row) => row.projectId),
    ...runs.map((row) => row.projectId),
  ]);
  const related = rows.filter((row) => relatedIds.has(row.id));
  if (related.length) {
    const matched = await matchKnownProject({
      candidates: related,
      subject: input.subject,
      bodyText: input.bodyText,
      includeQuotedHistory: input.includeQuotedHistory,
      relationship: "printer",
    });
    if (matched) return matched;
  }

  // Without a saved printer relationship, preserve the conservative title/slug
  // fallback. AI is not allowed to choose from the entire workspace.
  const content = normalizedHaystack([input.subject, input.bodyText]);
  return deterministicKnownProjectMatch(rows, content);
}

async function inferRunId(input: {
  projectId: string;
  contactId?: string | null;
}): Promise<string | null> {
  if (input.contactId) {
    const [run] = await db
      .select({ id: printRuns.id })
      .from(printRuns)
      .where(
        and(
          eq(printRuns.projectId, input.projectId),
          or(eq(printRuns.contactId, input.contactId), isNull(printRuns.contactId))
        )
      )
      .orderBy(desc(printRuns.createdAt))
      .limit(1);
    return run?.id ?? null;
  }

  const runs = await db
    .select({ id: printRuns.id })
    .from(printRuns)
    .where(eq(printRuns.projectId, input.projectId))
    .orderBy(desc(printRuns.createdAt))
    .limit(2);
  return runs.length === 1 ? runs[0].id : null;
}

export async function linkPrintThread(input: {
  threadId: string;
  participantEmails: string[];
  participantNames?: string[];
  subject?: string | null;
  bodyText?: string | null;
  includeQuotedHistory?: boolean;
  existingProjectId?: string | null;
  runId?: string | null;
}) {
  const contact = await findPrintContact({
    participantEmails: input.participantEmails,
    participantNames: input.participantNames,
  });
  const projectId = await inferProjectId({
    ...input,
    contactId: contact?.id ?? null,
  });
  const shouldLink =
    !!contact || !!input.runId || (!!projectId && looksLikePrintMessage(input));
  if (!shouldLink) return null;

  let runId = input.runId ?? null;
  if (!runId && projectId) {
    runId = await inferRunId({ projectId, contactId: contact?.id ?? null });
  }

  const latestProofUrl = extractLatestProofUrl(input.bodyText ?? "");
  await db
    .insert(printThreadLinks)
    .values({
      threadId: input.threadId,
      projectId,
      contactId: contact?.id ?? null,
      runId,
      matchedBy: contact ? "participant" : input.runId ? "manual" : "content",
      latestProofUrl,
    })
    .onConflictDoUpdate({
      target: printThreadLinks.threadId,
      set: {
        projectId,
        contactId: contact?.id ?? null,
        runId,
        latestProofUrl,
        updatedAt: new Date(),
      },
    });

  if (projectId) {
    const [assigned] = await db
      .update(emailThreads)
      .set({ projectId, updatedAt: new Date() })
      .where(and(eq(emailThreads.id, input.threadId), isNull(emailThreads.projectId)))
      .returning({ id: emailThreads.id });
    // Mirror the auto-assigned primary into the many-to-many join table.
    if (assigned) await ensureThreadProjectLink(db, input.threadId, projectId);
  }

  if (latestProofUrl && runId) {
    await db
      .update(printRuns)
      .set({ latestProofUrl, updatedAt: new Date() })
      .where(eq(printRuns.id, runId));
  }

  return { projectId, contactId: contact?.id ?? null, runId, latestProofUrl };
}
