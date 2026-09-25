export type WorkspaceIdentity = {
  organizationNames: string[];
  internalEmailDomains: string[];
  activeUsers: Array<{ name: string; email: string }>;
};

export type SuggestedCounterpartyIdentity = {
  organizationName: string;
  contactName: string;
  contactEmail: string;
};

export const normalizeIdentityName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type ProjectKind =
  | "book"
  | "article"
  | "podcast"
  | "video_series"
  | "other";

export type ProjectCandidate = {
  suggestedTitle: string;
  kind: ProjectKind;
  reason: string;
  confidence: number;
  videoProductionMode: "original" | "translation" | null;
};

const PROJECT_KINDS: readonly ProjectKind[] = [
  "book",
  "article",
  "podcast",
  "video_series",
  "other",
];

/**
 * Extract the qualifying new-project candidates from a raw AI signal: keep only
 * well-formed entries with a non-empty title and `confidence >= minConfidence`,
 * deduplicated by normalized title (the model sometimes repeats a deliverable).
 * One email can introduce several projects, so this returns a list.
 */
export function qualifyingProjectCandidates(
  raw: unknown,
  minConfidence = 0.8
): ProjectCandidate[] {
  const list =
    raw && typeof raw === "object" &&
    Array.isArray((raw as Record<string, unknown>).projectCandidates)
      ? ((raw as Record<string, unknown>).projectCandidates as unknown[])
      : [];
  const seen = new Set<string>();
  const out: ProjectCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const c = item as Partial<ProjectCandidate>;
    const title =
      typeof c.suggestedTitle === "string" ? c.suggestedTitle.trim() : "";
    const confidence = typeof c.confidence === "number" ? c.confidence : NaN;
    if (!title || !(confidence >= minConfidence)) continue;
    const key = normalizeIdentityName(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      suggestedTitle: title,
      kind: PROJECT_KINDS.includes(c.kind as ProjectKind)
        ? (c.kind as ProjectKind)
        : "other",
      reason: typeof c.reason === "string" ? c.reason : "",
      confidence,
      videoProductionMode:
        c.kind === "video_series" && c.videoProductionMode === "translation"
          ? "translation"
          : c.kind === "video_series"
            ? "original"
            : null,
    });
  }
  return out;
}

export type ReminderCadence = "one_off" | "monthly" | "quarterly" | "annual";

/**
 * A dated obligation a funder's email places on the recipient — either a single
 * deadline (a one-off dated task) or a recurring reporting duty (a grant
 * obligation). `dueDate` is a `YYYY-MM-DD` calendar date, kept only when the
 * email states one explicitly; otherwise null. `recurring`/`cadence` decide
 * whether committing it creates a one-off task or a recurring obligation.
 */
export type ReminderCandidate = {
  title: string;
  detail: string;
  dueDate: string | null;
  recurring: boolean;
  cadence: ReminderCadence;
  confidence: number;
  reason: string;
};

export type GrantReminderContext = {
  hasFundingPartnerLink: boolean;
  hasPrintLink: boolean;
  counterpartyType: CounterpartyType | null;
  counterpartyConfidence: number | null;
};

/**
 * Grant reminders are specialized funding workflow, not a generic promise or
 * deadline detector. Require concrete funding context and reject printer
 * threads deterministically even when the model labels a vendor promise as a
 * reminder.
 */
export function allowsGrantReminderSuggestions(
  context: GrantReminderContext
): boolean {
  if (context.hasPrintLink || context.counterpartyType === "printer") return false;
  if (context.hasFundingPartnerLink) return true;
  return (
    context.counterpartyType === "funding_partner" &&
    (context.counterpartyConfidence ?? 0) >= 0.8
  );
}

const REMINDER_CADENCES: readonly ReminderCadence[] = [
  "one_off",
  "monthly",
  "quarterly",
  "annual",
];

const PERIODIC_CADENCES = new Set<ReminderCadence>([
  "monthly",
  "quarterly",
  "annual",
]);

/** A strict `YYYY-MM-DD` calendar date, or null when absent/blank/impossible. */
function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  // Reject impossible calendar dates (e.g. 2025-02-30): a valid date round-trips.
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Extract the qualifying dated-reminder candidates from a raw AI signal: a
 * funder's dated deliverables (a one-off grant report) and recurring reporting
 * duties (monthly/quarterly/annual). Keeps only well-formed entries with a
 * non-empty title and `confidence >= minConfidence`. A reminder is treated as
 * recurring only when the model both flags it AND names a periodic cadence — so
 * a vague "recurring" flag never mints a phantom unanchored recurring rule.
 */
export function qualifyingReminderCandidates(
  raw: unknown,
  minConfidence = 0.8
): ReminderCandidate[] {
  const list =
    raw && typeof raw === "object" &&
    Array.isArray((raw as Record<string, unknown>).reminderCandidates)
      ? ((raw as Record<string, unknown>).reminderCandidates as unknown[])
      : [];
  const out: ReminderCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const title = typeof c.title === "string" ? c.title.trim() : "";
    const confidence = typeof c.confidence === "number" ? c.confidence : NaN;
    if (!title || !(confidence >= minConfidence)) continue;
    const rawCadence =
      typeof c.cadence === "string" &&
      REMINDER_CADENCES.includes(c.cadence as ReminderCadence)
        ? (c.cadence as ReminderCadence)
        : "one_off";
    const recurring = c.recurring === true && PERIODIC_CADENCES.has(rawCadence);
    const cadence: ReminderCadence = recurring ? rawCadence : "one_off";
    const dueDate = normalizeDueDate(c.dueDate);
    // A one-off suggestion must have an explicit, valid calendar date. Relative
    // vendor promises such as "we will send the proof tomorrow" are useful
    // correspondence context, but must not become grant-reminder proposals.
    if (!recurring && !dueDate) continue;
    out.push({
      title,
      detail: typeof c.detail === "string" ? c.detail.trim() : "",
      dueDate,
      recurring,
      cadence,
      confidence,
      reason: typeof c.reason === "string" ? c.reason : "",
    });
  }
  return out;
}

/** Min/max length (chars) enforced on a learned negative lesson's text. */
export const EMAIL_SIGNAL_LESSON_MIN_CHARS = 12;
export const EMAIL_SIGNAL_LESSON_MAX_CHARS = 500;

/**
 * A negative-lesson candidate proposed by the offline reflection pass, before
 * the deterministic gate accepts it.
 */
export type ProposedEmailSignalLesson = {
  lesson: string;
  confidence: number;
  evidenceRefs: string[];
};

/**
 * Reflection may sharpen intake judgment but must never touch authorization,
 * confirmation, or sending policy. Adapted from the assistant reflection's
 * safety denylist: any lesson whose text tries to change those is dropped.
 */
const EMAIL_SIGNAL_LESSON_DENYLIST =
  /\b(auto[- ]?approve|skip (?:approval|confirmation)|send without|bypass|elevate role|grant permission|ignore authorization|disable safety)\b/i;

/**
 * Deterministic gate for a proposed negative lesson, mirroring the assistant
 * reflection's `lessonPassesDeterministicGate`. A lesson is kept only when its
 * text is 12–500 chars, its confidence is within 0.6–1, it cites at least two
 * distinct evidence refs that all exist in the supplied dismissal set, and it
 * does not trip the safety denylist. Pure and side-effect free so it can be
 * unit-tested and reused by the reflection pass.
 */
export function emailSignalLessonPassesGate(
  lesson: ProposedEmailSignalLesson,
  allowedRefs: ReadonlySet<string>
): boolean {
  const text = typeof lesson.lesson === "string" ? lesson.lesson.trim() : "";
  if (
    text.length < EMAIL_SIGNAL_LESSON_MIN_CHARS ||
    text.length > EMAIL_SIGNAL_LESSON_MAX_CHARS
  ) {
    return false;
  }
  if (
    typeof lesson.confidence !== "number" ||
    !(lesson.confidence >= 0.6) ||
    lesson.confidence > 1
  ) {
    return false;
  }
  const uniqueRefs = [
    ...new Set((lesson.evidenceRefs ?? []).filter((ref) => typeof ref === "string")),
  ];
  if (uniqueRefs.length < 2) return false;
  if (!uniqueRefs.every((ref) => allowedRefs.has(ref))) return false;
  if (EMAIL_SIGNAL_LESSON_DENYLIST.test(text)) return false;
  return true;
}

export type CounterpartyType =
  | "rights_holder"
  | "funding_partner"
  | "printer"
  | "none";

export type CounterpartySignal = {
  counterpartyType: CounterpartyType;
  counterpartyConfidence: number;
  counterpartyName: string;
  contactName: string;
  contactEmail: string;
  counterpartyReason: string;
};

/** Validate the counterparty half of a raw AI signal (independent of projects). */
export function normalizeCounterpartySignal(
  raw: unknown
): CounterpartySignal | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<CounterpartySignal>;
  if (
    typeof s.counterpartyConfidence !== "number" ||
    typeof s.counterpartyName !== "string" ||
    typeof s.contactName !== "string" ||
    typeof s.contactEmail !== "string" ||
    typeof s.counterpartyReason !== "string" ||
    !["rights_holder", "funding_partner", "printer", "none"].includes(
      s.counterpartyType ?? ""
    )
  ) {
    return null;
  }
  return s as CounterpartySignal;
}

export function isInternalCounterparty(
  counterparty: SuggestedCounterpartyIdentity,
  identity: WorkspaceIdentity
) {
  const internalNames = new Set([
    ...identity.organizationNames.map(normalizeIdentityName),
    ...identity.activeUsers.map((member) => normalizeIdentityName(member.name)),
  ]);
  const internalEmails = new Set(
    identity.activeUsers.map((member) => member.email.trim().toLowerCase())
  );
  const internalDomains = new Set(
    [
      ...identity.internalEmailDomains,
      ...identity.activeUsers.map((member) => member.email.split("@")[1] ?? ""),
    ]
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean)
  );
  const email = counterparty.contactEmail.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";

  return (
    internalNames.has(normalizeIdentityName(counterparty.organizationName)) ||
    internalNames.has(normalizeIdentityName(counterparty.contactName)) ||
    internalEmails.has(email) ||
    (!!domain && internalDomains.has(domain))
  );
}
