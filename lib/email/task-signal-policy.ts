import { createHash } from "node:crypto";

export const EMAIL_TASK_ACTION_KINDS = [
  "schedule_meeting",
  "reply",
  "follow_up",
  "review",
  "send",
  "general",
] as const;

export type EmailTaskActionKind = (typeof EMAIL_TASK_ACTION_KINDS)[number];
export type EmailTaskPriority = "low" | "medium" | "high" | "urgent";

/**
 * Forwarded correspondence can still inform projects and other extraction, but
 * historical messages should not become present-day work. Use the outer
 * forward/capture timestamp as the reference so delayed mailbox processing does
 * not change the decision.
 */
export function forwardedEmailIsTooOldForTaskSuggestions(input: {
  originalDate: Date | null;
  forwardedAt: Date | null;
  now?: Date;
}): boolean {
  const { originalDate } = input;
  if (!originalDate || !Number.isFinite(originalDate.getTime())) return false;

  const reference =
    input.forwardedAt && Number.isFinite(input.forwardedAt.getTime())
      ? input.forwardedAt
      : (input.now ?? new Date());
  if (!Number.isFinite(reference.getTime()) || originalDate >= reference) {
    return false;
  }

  const oneYearAnniversary = new Date(originalDate);
  oneYearAnniversary.setUTCFullYear(oneYearAnniversary.getUTCFullYear() + 1);
  return oneYearAnniversary < reference;
}

type ActiveEmailRecipient = {
  id: string;
  name: string;
  email: string;
};

/** Return one unambiguous active teammate addressed directly in To (not Cc). */
export function uniqueDirectEmailRecipient(
  toAddrs: readonly string[],
  activeUsers: readonly ActiveEmailRecipient[]
): ActiveEmailRecipient | null {
  const directEmails = new Set(
    toAddrs.map((email) => email.trim().toLocaleLowerCase()).filter(Boolean)
  );
  const matches = activeUsers.filter((member) =>
    directEmails.has(member.email.trim().toLocaleLowerCase())
  );
  return matches.length === 1 ? matches[0] : null;
}

export type EmailTaskCandidate = {
  actionKind: EmailTaskActionKind;
  title: string;
  description: string;
  dueDate: string | null;
  priority: EmailTaskPriority;
  primaryUrl: string | null;
  primaryUrlLabel: string | null;
  confidence: number;
  reason: string;
  requestedAssigneeEmail: string | null;
  explicitIntentEvidence: string | null;
  mode: "explicit_auto" | "implicit_review";
  candidateKey: string;
};

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?]+$/;

/** Exact HTTP(S) links present in the message. The assistant never fetches them. */
export function extractSafeEmailUrls(value: string | null | undefined): string[] {
  const found = value?.match(URL_RE) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const candidate = raw.replace(TRAILING_URL_PUNCTUATION, "");
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (url.username || url.password) continue;
      out.push(url.toString());
    } catch {
      // Malformed links stay ordinary email text.
    }
  }
  return [...new Set(out)].slice(0, 30);
}

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? value
    : null;
}

function exactEvidence(note: string | null, evidence: unknown): string | null {
  if (!note || typeof evidence !== "string") return null;
  const trimmed = evidence.trim();
  if (!trimmed || trimmed.length > 300) return null;
  return note.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase())
    ? trimmed
    : null;
}

function evidencedPriority(note: string | null, evidence: unknown, value: unknown) {
  const quote = exactEvidence(note, evidence);
  const requested = String(value);
  if (
    !quote ||
    !["low", "high", "urgent"].includes(requested) ||
    !new RegExp(`\\b${requested}\\b`, "i").test(quote)
  ) {
    return "medium" as const;
  }
  return requested as Exclude<EmailTaskPriority, "medium">;
}

function exactAllowedUrl(value: unknown, allowed: ReadonlySet<string>) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const normalized = new URL(value.trim()).toString();
    return allowed.has(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function emailTaskCandidateKey(input: {
  actionKind: string;
  title: string;
  dueDate: string | null;
  primaryUrl: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actionKind: input.actionKind,
        title: input.title.toLocaleLowerCase().replace(/\s+/g, " ").trim(),
        dueDate: input.dueDate,
        primaryUrl: input.primaryUrl,
      })
    )
    .digest("hex")
    .slice(0, 32);
}

/** Validate model output and enforce the explicit-intent auto-create gate. */
export function qualifyingEmailTaskCandidates(
  raw: unknown,
  input: {
    allowedUrls: string[];
    forwarderNote: string | null;
    sourceText?: string | null;
    minConfidence?: number;
  }
): EmailTaskCandidate[] {
  if (!raw || typeof raw !== "object") return [];
  const list = Array.isArray((raw as Record<string, unknown>).taskCandidates)
    ? ((raw as Record<string, unknown>).taskCandidates as unknown[])
    : [];
  const allowed = new Set(input.allowedUrls);
  const minConfidence = input.minConfidence ?? 0.8;
  const out: EmailTaskCandidate[] = [];
  const seen = new Set<string>();

  for (const item of list.slice(0, 5)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const confidence =
      typeof row.confidence === "number" ? row.confidence : Number.NaN;
    const actionKind = EMAIL_TASK_ACTION_KINDS.includes(
      row.actionKind as EmailTaskActionKind
    )
      ? (row.actionKind as EmailTaskActionKind)
      : null;
    if (!title || title.length > 300 || !actionKind || confidence < minConfidence) {
      continue;
    }

    const dueDateEvidence = exactEvidence(
      input.sourceText ?? null,
      row.dueDateEvidence
    );
    const dueDate = dueDateEvidence ? validDate(row.dueDate) : null;
    const primaryUrl = exactAllowedUrl(row.primaryUrl, allowed);
    const evidence = exactEvidence(input.forwarderNote, row.intentEvidence);
    const explicit = row.explicitIntent === true && confidence >= 0.9 && !!evidence;
    const candidate: EmailTaskCandidate = {
      actionKind,
      title,
      description:
        typeof row.description === "string"
          ? row.description.trim().slice(0, 4_000)
          : "",
      dueDate,
      // Priority is deliberately conservative: only an exact trusted-note
      // instruction may raise it above medium.
      priority: explicit
        ? evidencedPriority(input.forwarderNote, row.priorityEvidence, row.priority)
        : "medium",
      primaryUrl,
      primaryUrlLabel:
        primaryUrl && typeof row.primaryUrlLabel === "string"
          ? row.primaryUrlLabel.trim().slice(0, 120) || null
          : null,
      confidence,
      reason:
        typeof row.reason === "string" ? row.reason.trim().slice(0, 1_000) : "",
      requestedAssigneeEmail:
        explicit &&
        exactEvidence(input.forwarderNote, row.assigneeEvidence) &&
        typeof row.requestedAssigneeEmail === "string"
          ? row.requestedAssigneeEmail.trim().toLocaleLowerCase() || null
          : null,
      explicitIntentEvidence: evidence,
      mode: explicit ? "explicit_auto" : "implicit_review",
      candidateKey: "",
    };
    candidate.candidateKey = emailTaskCandidateKey(candidate);
    if (seen.has(candidate.candidateKey)) continue;
    seen.add(candidate.candidateKey);
    out.push(candidate);
  }
  return out;
}

export type EmailTaskSnapshot = {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: EmailTaskPriority;
  projectId: string | null;
  assignedTo: string;
  actionKind: EmailTaskActionKind;
  senderDomain: string | null;
};

export function snapshotChanged(
  original: EmailTaskSnapshot,
  final: EmailTaskSnapshot
): boolean {
  return JSON.stringify(original) !== JSON.stringify(final);
}

export function senderDomain(value: string | null | undefined): string | null {
  const email = value?.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return email?.[1]?.toLocaleLowerCase() ?? null;
}
