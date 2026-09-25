import { z } from "zod";

import { lineAmountCents } from "@/lib/budget/compute";
import type {
  ExtractedBudgetLine,
  ExtractedInvoice,
  ExtractedMouPayment,
  ExtractedObligation,
  ExtractedProject,
  ImportExtraction,
} from "./types";

/** Budget categories/units, mirroring the DB enums in `lib/db/schema/enums.ts`. */
const CATEGORIES = [
  "translation",
  "proofreading",
  "editing",
  "cover_design",
  "typesetting",
  "project_management",
  "print_ship",
  "audiobook",
  "video_series",
  "custom",
] as const;
const UNITS = ["words", "pages", "cover", "project", "flat"] as const;
const AGREEMENT_TYPES = ["mou_only", "mou_plus_license", "license_only"] as const;
const MOU_PAYMENT_TRIGGERS = [
  "on_signing",
  "on_completion",
  "on_52_episodes",
  "custom",
] as const;
const PROJECT_KINDS = [
  "book",
  "article",
  "podcast",
  "video_series",
  "other",
] as const;
const OBLIGATION_KINDS = [
  "attribution",
  "copyright_notice",
  "artwork_approval",
  "analytics_report",
  "format_restriction",
  "territory_restriction",
  "sample_delivery",
  "other",
] as const;
const OBLIGATION_CADENCES = [
  "per_episode",
  "per_artwork",
  "monthly",
  "quarterly",
  "annual",
  "standing",
  "on_publish",
] as const;
const NUMERIC_STRING = { type: "string" } as const;

/**
 * JSON Schema for the document extraction. Anthropic's structured-output
 * grammar compiler rejects a schema this large ("compiled grammar is too
 * large"), so it is no longer sent as a strict `response_format` — the import
 * flow embeds it in the system prompt (strict: false, plain JSON mode) and
 * `normalizeExtraction` enforces the shape locally before anything is stored.
 *
 * Keep it strict-mode-compatible anyway (every property `required`,
 * `additionalProperties: false`, numbers as strings — "" when absent) so the
 * prompt stays unambiguous and strict mode can be re-enabled if provider
 * limits change; `schema.test.ts` guards the complexity budget.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentKind",
    "invoice",
    "agreementType",
    "partnerOrg",
    "contactName",
    "contactEmail",
    "contactPhone",
    "signedDate",
    "documentTitle",
    "agreementTotalAmount",
    "mouPaymentSchedule",
    "paymentProjectIndex",
    "sharedFees",
    "projects",
  ],
  properties: {
    documentKind: { type: "string", enum: ["agreement", "invoice"] },
    invoice: {
      type: "object",
      additionalProperties: false,
      required: [
        "direction",
        "invoiceNumber",
        "issueDate",
        "dueDate",
        "issuerName",
        "recipientName",
        "recipientEmail",
        "projectTitle",
        "amount",
        "currency",
        "description",
      ],
      properties: {
        direction: {
          type: "string",
          enum: ["outgoing", "incoming", "unknown"],
        },
        invoiceNumber: { type: "string" },
        issueDate: { type: "string" },
        dueDate: { type: "string" },
        issuerName: { type: "string" },
        recipientName: { type: "string" },
        recipientEmail: { type: "string" },
        projectTitle: { type: "string" },
        amount: NUMERIC_STRING,
        currency: { type: "string" },
        description: { type: "string" },
      },
    },
    agreementType: { type: "string", enum: AGREEMENT_TYPES },
    partnerOrg: { type: "string" },
    contactName: { type: "string" },
    contactEmail: { type: "string" },
    contactPhone: { type: "string" },
    signedDate: { type: "string" },
    documentTitle: { type: "string" },
    agreementTotalAmount: NUMERIC_STRING,
    mouPaymentSchedule: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["trigger", "amount", "dueDate", "notes", "deliveryRequirements", "sourceClause"],
        properties: {
          deliveryRequirements: { type: "array", items: { type: "string" } },
          sourceClause: { type: "string" },
          trigger: { type: "string", enum: MOU_PAYMENT_TRIGGERS },
          amount: NUMERIC_STRING,
          dueDate: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
    paymentProjectIndex: NUMERIC_STRING,
    sharedFees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "category", "amount", "appliesToTitles"],
        properties: {
          label: { type: "string" },
          category: { type: "string", enum: CATEGORIES },
          amount: NUMERIC_STRING,
          appliesToTitles: { type: "array", items: { type: "string" } },
        },
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "kind",
          "videoProductionMode",
          "sourceAuthor",
          "licenseHolder",
          "rightsGrantedByAgreement",
          "formats",
          "territory",
          "maxCopies",
          "startDate",
          "publicationDate",
          "completeWithinMonths",
          "partnerUpdateDate",
          "wordCount",
          "licenseTermMonths",
          "autoRenews",
          "renewalMonths",
          "renewalNoticeDays",
          "copyrightHolder",
          "copyrightNotice",
          "currency",
          "totalAmount",
          "paymentTerms",
          "episodeCount",
          "episodeCountMode",
          "nonCommercialOnly",
          "budgetLines",
          "obligations",
        ],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          kind: { type: "string", enum: PROJECT_KINDS },
          videoProductionMode: {
            type: "string",
            enum: ["original", "translation"],
          },
          sourceAuthor: { type: "string" },
          licenseHolder: { type: "string" },
          rightsGrantedByAgreement: { type: "boolean" },
          formats: {
            type: "object",
            additionalProperties: false,
            required: ["print", "ebook", "audio", "video"],
            properties: {
              print: { type: "boolean" },
              ebook: { type: "boolean" },
              audio: { type: "boolean" },
              video: { type: "boolean" },
            },
          },
          territory: { type: "string" },
          maxCopies: NUMERIC_STRING,
          startDate: { type: "string" },
          publicationDate: { type: "string" },
          completeWithinMonths: NUMERIC_STRING,
          partnerUpdateDate: { type: "string" },
          wordCount: NUMERIC_STRING,
          licenseTermMonths: NUMERIC_STRING,
          autoRenews: { type: "boolean" },
          renewalMonths: NUMERIC_STRING,
          renewalNoticeDays: NUMERIC_STRING,
          copyrightHolder: { type: "string" },
          copyrightNotice: { type: "string" },
          currency: { type: "string" },
          totalAmount: NUMERIC_STRING,
          paymentTerms: { type: "string" },
          episodeCount: NUMERIC_STRING,
          episodeCountMode: {
            type: "string",
            enum: ["total", "additional"],
          },
          nonCommercialOnly: { type: "boolean" },
          budgetLines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "category", "unit", "quantity", "unitPrice", "amount"],
              properties: {
                label: { type: "string" },
                category: { type: "string", enum: CATEGORIES },
                unit: { type: "string", enum: UNITS },
                quantity: NUMERIC_STRING,
                unitPrice: NUMERIC_STRING,
                amount: NUMERIC_STRING,
              },
            },
          },
          obligations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "clauseRef",
                "kind",
                "cadence",
                "firstDueDate",
                "label",
                "text",
              ],
              properties: {
                clauseRef: { type: "string" },
                kind: { type: "string", enum: OBLIGATION_KINDS },
                cadence: { type: "string", enum: OBLIGATION_CADENCES },
                firstDueDate: { type: "string" },
                label: { type: "string" },
                text: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ── Defensive Zod normalizer ────────────────────────────────────────────────
// Strict json_schema already guarantees structure, but a fallback model may
// return looser output (numbers as strings, an out-of-enum category). Coerce
// everything into the exact `ImportExtraction` shape before it is stored.

const numOrNull = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, $]/g, ""));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

const strOrNull = z.preprocess(
  (v) => (v === undefined || v === "" ? null : v),
  z.string().nullable()
);

/** Coerce a model-supplied date into yyyy-mm-dd, or null. */
const dateOrNull = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  // Read local components (matches how `new Date(s)` parsed it) so the date is
  // never shifted a day by a UTC conversion in a positive-offset timezone.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}, z.string().nullable());

const bool = z.preprocess((v) => v === true, z.boolean());
const boolOrNull = z.preprocess(
  (v) => (v == null ? null : v === true),
  z.boolean().nullable()
);

/** Add whole months to a yyyy-mm-dd date, clamping the day to the month end. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(d, lastDay);
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  return `${base.getUTCFullYear()}-${mm}-${String(day).padStart(2, "0")}`;
}

const categorySchema = z.preprocess(
  (v) => (CATEGORIES.includes(v as (typeof CATEGORIES)[number]) ? v : "custom"),
  z.enum(CATEGORIES)
);
const unitSchema = z.preprocess(
  (v) => (UNITS.includes(v as (typeof UNITS)[number]) ? v : "flat"),
  z.enum(UNITS)
);

const budgetLineSchema = z.object({
  label: z.preprocess((v) => (v == null ? "Line item" : v), z.string()),
  category: categorySchema,
  unit: unitSchema,
  quantity: numOrNull,
  unitPrice: numOrNull,
  amount: numOrNull,
  notes: strOrNull,
});

const sharedFeeSchema = z.object({
  label: z.preprocess((v) => (v == null ? "Shared fee" : v), z.string()),
  category: categorySchema,
  amount: numOrNull,
  appliesToTitles: z.array(z.string()).default([]),
});

const fxConversionSchema = z
  .object({
    from: z.string(),
    to: z.literal("USD"),
    rate: z.number().positive(),
    rateDate: z.string(),
    provider: z.string(),
  })
  .nullable()
  .default(null);

const mouPaymentSchema = z.object({
  deliveryRequirements: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  sourceClause: z.string().nullable().optional(),
  trigger: z.preprocess(
    (v) =>
      MOU_PAYMENT_TRIGGERS.includes(v as (typeof MOU_PAYMENT_TRIGGERS)[number])
        ? v
        : "custom",
    z.enum(MOU_PAYMENT_TRIGGERS)
  ),
  amount: numOrNull,
  dueDate: dateOrNull,
  notes: strOrNull,
});

const invoiceSchema = z.object({
  direction: z.enum(["outgoing", "incoming", "unknown"]).catch("unknown"),
  invoiceNumber: strOrNull,
  issueDate: dateOrNull,
  dueDate: dateOrNull,
  issuerName: strOrNull,
  recipientName: strOrNull,
  recipientEmail: strOrNull,
  projectTitle: strOrNull,
  amount: numOrNull,
  currency: strOrNull,
  description: strOrNull,
});

const EMPTY_INVOICE = {
  direction: "unknown" as const,
  invoiceNumber: null,
  issueDate: null,
  dueDate: null,
  issuerName: null,
  recipientName: null,
  recipientEmail: null,
  projectTitle: null,
  amount: null,
  currency: null,
  description: null,
};

const projectKindSchema = z.preprocess(
  (v) =>
    PROJECT_KINDS.includes(v as (typeof PROJECT_KINDS)[number]) ? v : null,
  z.enum(PROJECT_KINDS).nullable()
);

const obligationSchema = z.object({
  clauseRef: strOrNull,
  kind: z.preprocess(
    (v) =>
      OBLIGATION_KINDS.includes(v as (typeof OBLIGATION_KINDS)[number])
        ? v
        : "other",
    z.enum(OBLIGATION_KINDS)
  ),
  cadence: z.preprocess(
    (v) =>
      OBLIGATION_CADENCES.includes(v as (typeof OBLIGATION_CADENCES)[number])
        ? v
        : "standing",
    z.enum(OBLIGATION_CADENCES)
  ),
  firstDueDate: dateOrNull,
  label: z.preprocess((v) => (v == null || v === "" ? "Obligation" : v), z.string()),
  text: z.preprocess((v) => (v == null ? "" : v), z.string()),
});

const projectSchema = z.object({
  title: z.preprocess((v) => (v == null ? "Untitled project" : v), z.string()),
  description: strOrNull,
  kind: projectKindSchema,
  videoProductionMode: z
    .enum(["original", "translation"])
    .nullable()
    .catch(null),
  sourceAuthor: strOrNull,
  licenseHolder: strOrNull,
  rightsGrantedByAgreement: boolOrNull,
  completeWithinMonths: numOrNull,
  partnerUpdateDate: dateOrNull,
  formats: z
    .object({ print: bool, ebook: bool, audio: bool, video: bool })
    .partial()
    .transform((f) => ({
      print: !!f.print,
      ebook: !!f.ebook,
      audio: !!f.audio,
      video: !!f.video,
    }))
    .catch({ print: false, ebook: false, audio: false, video: false }),
  territory: strOrNull,
  maxCopies: numOrNull,
  startDate: dateOrNull,
  publicationDate: dateOrNull,
  wordCount: numOrNull,
  licenseTermMonths: numOrNull,
  autoRenews: bool,
  renewalMonths: numOrNull,
  renewalNoticeDays: numOrNull,
  copyrightHolder: strOrNull,
  copyrightNotice: strOrNull,
  currency: strOrNull,
  fxConversion: fxConversionSchema,
  totalAmount: numOrNull,
  paymentTerms: strOrNull,
  episodeCount: numOrNull,
  episodeCountMode: z.enum(["total", "additional"]).catch("total"),
  nonCommercialOnly: bool,
  mouPaymentSchedule: z.array(mouPaymentSchema).default([]),
  budgetLines: z.array(budgetLineSchema).default([]),
  obligations: z.array(obligationSchema).default([]),
});

const extractionSchema = z.object({
  documentKind: z.enum(["agreement", "invoice"]).catch("agreement"),
  // `normalizeExtraction` stores `invoice: null` for agreements, and getImport
  // re-normalizes the stored copy on every review-page load — so the schema must
  // round-trip its own output. `.default()` only fills `undefined`, so coalesce
  // null → undefined here; otherwise a stored agreement crashes the review page.
  invoice: z.preprocess((v) => v ?? undefined, invoiceSchema.default(EMPTY_INVOICE)),
  agreementType: z.enum(AGREEMENT_TYPES).catch("mou_only"),
  partnerOrg: strOrNull,
  contactName: strOrNull,
  contactEmail: strOrNull,
  contactPhone: strOrNull,
  signedDate: dateOrNull,
  documentTitle: strOrNull,
  agreementTotalAmount: numOrNull,
  mouPaymentSchedule: z.array(mouPaymentSchema).default([]),
  paymentProjectIndex: numOrNull,
  sharedFees: z.array(sharedFeeSchema).default([]),
  projects: z.array(projectSchema).default([]),
});

const normalizedTitle = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();

/** Split a money total into cent-accurate shares whose sum equals the source. */
function splitMoney(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) =>
    (base + (index < remainder ? 1 : 0)) / 100
  );
}

const IMPORT_ARITHMETIC_NOTE =
  "Imported quantity and unit price did not match the stated total; the stated total was preserved as a flat amount.";

/**
 * A document's explicit line total is authoritative. If extraction supplies
 * missing or contradictory quantity/rate fields, represent the line as a flat
 * total so every budget surface keeps QTY × unit price = amount.
 */
function normalizeBudgetLine(line: ExtractedBudgetLine): ExtractedBudgetLine {
  if (line.amount == null) return line;

  const hasQuantityAndRate =
    line.quantity != null && line.unitPrice != null;
  const statedTotalCents = Math.round(line.amount * 100);
  const arithmeticMatches =
    hasQuantityAndRate &&
    lineAmountCents(line.quantity, line.unitPrice) === statedTotalCents;

  if (arithmeticMatches) return line;

  const notes =
    hasQuantityAndRate && line.notes !== IMPORT_ARITHMETIC_NOTE
      ? [line.notes, IMPORT_ARITHMETIC_NOTE].filter(Boolean).join("\n")
      : line.notes;

  return {
    ...line,
    unit: "flat",
    quantity: 1,
    unitPrice: line.amount,
    notes,
  };
}

/** Allocate document/group fees to the exact projects they cover. */
function allocateSharedFees(
  extraction: ImportExtraction,
  fees: z.infer<typeof sharedFeeSchema>[]
): ImportExtraction {
  if (fees.length === 0 || extraction.projects.length === 0) return extraction;

  const projects = extraction.projects.map((project) => ({
    ...project,
    budgetLines: [...project.budgetLines],
  }));

  for (const fee of fees) {
    if (fee.amount == null) continue;
    const requested = new Set(fee.appliesToTitles.map(normalizedTitle));
    let indices = projects
      .map((project, index) => ({ index, title: normalizedTitle(project.title) }))
      .filter(({ title }) => requested.size === 0 || requested.has(title))
      .map(({ index }) => index);

    // A model typo must not silently drop a real document-level cost. Falling
    // back to every title is visible in the generated line note and review UI.
    const scopeFallback = requested.size > 0 && indices.length === 0;
    if (scopeFallback) indices = projects.map((_, index) => index);

    const shares = splitMoney(fee.amount, indices.length);
    for (const [shareIndex, projectIndex] of indices.entries()) {
      const project = projects[projectIndex];
      const share = shares[shareIndex];
      const currency = project.currency?.trim().toUpperCase() || "USD";
      const scope = `${indices.length} project${indices.length === 1 ? "" : "s"}`;
      const note = `${currency} ${fee.amount.toFixed(2)} shared equally across ${scope}${
        scopeFallback ? " (title scope could not be matched)" : ""
      }.`;
      project.budgetLines.push({
        label: `${fee.label} (1/${indices.length} share)`,
        category: fee.category,
        unit: "flat",
        quantity: 1,
        unitPrice: share,
        amount: share,
        notes: note,
      });
      project.totalAmount =
        project.totalAmount == null
          ? project.budgetLines.reduce(
              (sum, line) => sum + (line.amount ?? 0),
              0
            )
          : Math.round((project.totalAmount + share) * 100) / 100;
    }
  }

  return { ...extraction, projects };
}

export function normalizeExtraction(raw: unknown): ImportExtraction {
  const p = extractionSchema.parse(raw);
  const legacyPaymentProjects = p.projects
    .map((project, index) => ({ index, schedule: project.mouPaymentSchedule }))
    .filter((entry) => entry.schedule.length > 0);
  const rootSchedule =
    p.mouPaymentSchedule.length > 0
      ? p.mouPaymentSchedule
      : legacyPaymentProjects[0]?.schedule ?? [];
  const legacySchedulesMatch = legacyPaymentProjects.every(
    (entry) => JSON.stringify(entry.schedule) === JSON.stringify(rootSchedule)
  );
  let paymentProjectIndex =
    p.paymentProjectIndex == null ? null : Math.round(p.paymentProjectIndex);
  if (p.mouPaymentSchedule.length === 0 && legacyPaymentProjects.length === 1) {
    paymentProjectIndex = legacyPaymentProjects[0].index;
  }
  if (
    !legacySchedulesMatch ||
    paymentProjectIndex == null ||
    paymentProjectIndex < 0 ||
    paymentProjectIndex >= p.projects.length
  ) {
    paymentProjectIndex = p.projects.length === 1 && rootSchedule.length > 0 ? 0 : null;
  }
  const normalized: ImportExtraction = {
    documentKind: p.documentKind,
    invoice:
      p.documentKind === "invoice"
        ? ({
            ...p.invoice,
            currency: p.invoice.currency?.trim().toUpperCase() || "USD",
          } satisfies ExtractedInvoice)
        : null,
    agreementType: p.agreementType,
    partnerOrg: p.partnerOrg,
    contactName: p.contactName,
    contactEmail: p.contactEmail,
    contactPhone: p.contactPhone,
    signedDate: p.signedDate,
    documentTitle: p.documentTitle,
    agreementTotalAmount:
      p.agreementTotalAmount ??
      (p.projects.length === 1 ? p.projects[0]?.totalAmount ?? null : null),
    mouPaymentSchedule: rootSchedule.map(
      (payment): ExtractedMouPayment => ({
        deliveryRequirements: payment.deliveryRequirements,
        sourceClause: payment.sourceClause ?? null,
        trigger: payment.trigger,
        amount: payment.amount,
        dueDate: payment.dueDate,
        notes: payment.notes,
      })
    ),
    paymentProjectIndex,
    projects: p.projects.map((proj): ExtractedProject => {
      const completeWithinMonths =
        proj.completeWithinMonths == null
          ? null
          : Math.round(proj.completeWithinMonths);
      // Due date: explicit publication date, else (Effective Date / signed /
      // start) + completion window. Effective Date often = the project start.
      const anchor = p.signedDate ?? proj.startDate;
      const dueDate =
        proj.publicationDate ??
        (completeWithinMonths != null && anchor
          ? addMonths(anchor, completeWithinMonths)
          : null);
      return {
        title: proj.title,
        description: proj.description,
        kind: proj.kind,
        videoProductionMode:
          proj.kind === "video_series"
            ? proj.videoProductionMode === "translation"
              ? "translation"
              : "original"
            : null,
        sourceAuthor: proj.sourceAuthor,
        licenseHolder: proj.licenseHolder,
        rightsGrantedByAgreement:
          proj.rightsGrantedByAgreement ??
          Object.values(proj.formats).some(Boolean),
        formats: proj.formats,
        territory: proj.territory,
        maxCopies: proj.maxCopies == null ? null : Math.round(proj.maxCopies),
        startDate: proj.startDate,
        publicationDate: dueDate,
        completeWithinMonths,
        partnerUpdateDate: proj.partnerUpdateDate,
        wordCount: proj.wordCount == null ? null : Math.round(proj.wordCount),
        licenseTermMonths:
          proj.licenseTermMonths == null ? null : Math.round(proj.licenseTermMonths),
        autoRenews: proj.autoRenews,
        renewalMonths:
          proj.renewalMonths == null ? null : Math.round(proj.renewalMonths),
        renewalNoticeDays:
          proj.renewalNoticeDays == null ? null : Math.round(proj.renewalNoticeDays),
        copyrightHolder: proj.copyrightHolder,
        copyrightNotice: proj.copyrightNotice,
        currency: proj.currency?.trim().toUpperCase() || "USD",
        fxConversion: proj.fxConversion,
        totalAmount: proj.totalAmount,
        paymentTerms: proj.paymentTerms,
        episodeCount:
          proj.episodeCount == null ? null : Math.round(proj.episodeCount),
        episodeCountMode: proj.episodeCountMode,
        nonCommercialOnly: proj.nonCommercialOnly,
        budgetLines: proj.budgetLines.map((l): ExtractedBudgetLine =>
          normalizeBudgetLine({
            label: l.label,
            category: l.category,
            unit: l.unit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
            notes: l.notes,
          })
        ),
        // Drop empty obligations (model returned a placeholder with no text).
        obligations: proj.obligations
          .filter((o) => o.text.trim().length > 0)
          .map(
            (o): ExtractedObligation => ({
              clauseRef: o.clauseRef,
              kind: o.kind,
              cadence: o.cadence,
              firstDueDate: o.firstDueDate,
              label: o.label,
              text: o.text,
            })
          ),
      };
    }),
  };
  return allocateSharedFees(normalized, p.sharedFees);
}

const NO_FORMATS = { print: false, ebook: false, audio: false, video: false };

/**
 * Zero out formats only when the extraction explicitly says the agreement does
 * not grant usable rights now. A limited/non-commercial grant can coexist with
 * a possible future commercial license, so `licenseHolder` alone is not enough
 * to discard current format rights. Applied once at extraction time — NOT in
 * `normalizeExtraction` (where the reviewer's choice must win).
 */
export function gateExtractionFormats(ex: ImportExtraction): ImportExtraction {
  return {
    ...ex,
    projects: ex.projects.map((p) => {
      return p.rightsGrantedByAgreement
        ? p
        : { ...p, formats: { ...NO_FORMATS } };
    }),
  };
}

/**
 * When a document states a TOTAL to be paid in N installments but doesn't state
 * each installment's amount, split the total evenly across the tranches (last
 * tranche absorbs any rounding remainder). Runs once at extraction time — NOT in
 * `normalizeExtraction` (which also runs on manual edits, where a reviewer who
 * clears an amount must win). Skips a project whose tranches already have amounts.
 */
export function fillMouPaymentAmounts(ex: ImportExtraction): ImportExtraction {
  const sched = ex.mouPaymentSchedule;
  if (
    sched.length === 0 ||
    ex.agreementTotalAmount == null ||
    ex.agreementTotalAmount <= 0 ||
    sched.some((s) => s.amount != null)
  ) {
    return ex;
  }
  const n = sched.length;
  const per = Math.round((ex.agreementTotalAmount / n) * 100) / 100;
  let remaining = Math.round(ex.agreementTotalAmount * 100) / 100;
  return {
    ...ex,
    mouPaymentSchedule: sched.map((payment, index) => {
      const amount = index === n - 1 ? remaining : per;
      remaining = Math.round((remaining - per) * 100) / 100;
      return { ...payment, amount };
    }),
  };
}

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured project and finance data from a document for a translation-publishing organization. The document may be a Memorandum of Understanding (MoU), commercial license, grant agreement, grant application / funding proposal, or invoice. A trusted WORKSPACE CONTEXT block is supplied separately; use it to identify the publisher (us), internal people, languages, territory, and currency without inventing organization details.

Return JSON matching the schema. Rules:
- "documentKind": use "invoice" when the document requests payment and identifies itself with an invoice number; otherwise use "agreement". Always return the complete "invoice" object, using empty strings for its missing fields when documentKind is agreement.
- For an invoice, extract "invoiceNumber", issue/due dates, issuer, bill-to recipient, recipient email, work/project title, exact total, ISO currency, and a concise description. "direction" is "outgoing" only when the trusted workspace organization (including an alias) is the issuer and the external partner is billed; it is "incoming" when an external party issued it to the workspace; otherwise use "unknown". Never infer that an invoice was paid merely because it exists.
- For an invoice, also return one minimal project entry for the named work (or the invoice description when no clean title exists), and one root mouPaymentSchedule row with trigger "custom", the invoice total/date, and invoice number in notes. Do not invent rights, agreement dates, obligations, or unrelated budget lines. Use "mou_only" as the agreementType compatibility value.
- "partnerOrg" is the EXTERNAL party the workspace organization is entering the agreement with — the funder / sponsor / grantor / MoU counterparty. It is never the workspace organization, one of its aliases, an internal email domain, or an active user.
- When the request includes an existing publisher / rights-holder directory, reuse the exact stored name for the same organization even if the document adds or omits an acronym or shorthand (for example, "Union Publishing" and "Union Publishing (UP)"). Do not force an ambiguous acronym to match.
- "licenseHolder" (per project): the ORIGINAL COPYRIGHT HOLDER from whom a separate license MUST be secured to carry out THIS agreement's current scope — often a DIFFERENT party from partnerOrg. Example: a funder ("9Marks") sponsors us to "pursue publishing rights from Union" — here partnerOrg="9Marks" and licenseHolder="Union". For a "license_only" agreement, set it to the grantor/licensor. If the document already grants the current non-commercial scope and merely says a commercial license MAY be obtained later for optional sales, leave licenseHolder empty and capture that clause as a format_restriction obligation instead.
- One document may cover SEVERAL distinct works. Create one entry in "projects" per distinct book/work/title. If the agreement bundles multiple titles (each with its own budget or amount), split them into separate projects.
- GRANT APPLICATION / FUNDING PROPOSAL: when the document REQUESTS funding for a body of work and lays out a high-level project budget TABLE of activities and their costs (rather than a signed agreement), treat EACH fundable line-item in that budget table as its OWN project — do NOT collapse the whole proposal into a single project. For each line-item: give the project a concise title from the activity (e.g. "Translate Calvin's Commentary on Colossians", "Weekly magazine article", "Study guides & course videos", "100 testimony videos"); set that project's "totalAmount" to the line-item's stated cost; and add ONE budgetLine carrying that cost (unit "flat", amount = the line total; category = the closest fit — translation for a translation, video_series for video production, custom otherwise). Set the root "agreementTotalAmount" to the proposal's grand total, and "partnerOrg" to the funder/grantor the proposal is addressed to (the trust/foundation/sponsor named in the cover letter or header). A proposal is normally UNSIGNED — leave "signedDate" empty so the requested funds are NOT recorded as received. If a grant/agreement reference number is stated (e.g. "Grant ID: 23-08435-AE05"), put it in "documentTitle" and repeat it in the notes of the root mouPaymentSchedule so it is preserved.
- "agreementTotalAmount" is the total funding/payment commitment for the WHOLE agreement across all works. Each project's "totalAmount" is only that work's stated subtotal. Never copy the agreement total into every project.
- "sharedFees" contains a fee stated once for a group of works rather than for one title. Put the full fee in "amount" and list the EXACT matching project titles in "appliesToTitles"; use an empty list only when it applies to every project. Examples: a £100 administration fee for the whole eight-title agreement is one shared fee applying to all titles; an £820 advance for four named storybooks is one shared fee applying to those four titles. Do NOT also copy a shared fee into project budgetLines or project totalAmount — the app divides it evenly, cent-accurately, across the matching projects. When the document states an explicit per-title amount such as "£205 each", you may instead put £205 directly on each matching project's budgetLines and omit that grouped row from sharedFees.
- "mouPaymentSchedule" is agreement-level and must appear ONCE at the root, even when several projects share it. Never repeat the schedule inside projects. "paymentProjectIndex" must be "" for a shared multi-project schedule so a manager explicitly chooses where the receivable is administered; for a one-project agreement use "0".
- "agreementType": use "license_only" when the document IS itself the license / rights contract from the copyright holder (a "Grant of Rights" that licenses the work to the Publisher). A document titled "License Agreement" / "Limited License Agreement" with a "Grant of Rights" clause is ALWAYS "license_only" — it stays "license_only" even when it states payments or grants only free/non-commercial rights. Use "mou_plus_license" only when a SEPARATE license is REQUIRED for the current agreed work. If an MoU itself grants the current non-commercial work and only mentions an OPTIONAL future commercial license for selling, use "mou_only". Do NOT choose "mou_plus_license" just because the document mentions payments.
- "nonCommercialOnly" (per project): true when the grant restricts the Publisher to FREE / non-commercial / not-for-sale distribution (e.g. "free-of-charge publication… and not to the sale, offer for sale, or distribution for sale"). false for a normal commercial/publishing license that permits selling. Default false.
- "rightsGrantedByAgreement" (per project): true when this document itself grants usable publishing/translation rights now, including limited or non-commercial rights. false for a funding-only agreement where a separate license is still required before any publishing can begin.
- "episodeCount" (per project): for an episodic series — a podcast (audio) OR a video_series — the number of episodes/videos the document covers (e.g. "104 episodes from the Ask Ligonier podcast" → "104"; "100 testimony videos" → "100"). Else "".
- "episodeCountMode" (per project): use "additional" when the document says "more", "additional", or "new" episodes/videos that should be appended to an existing series; otherwise use "total" for the total episode/video count covered.
- "signedDate": only if the document is actually signed/executed, as ISO yyyy-mm-dd. Use "" if unsigned or unknown. The "Effective Date" is the date the last party signs — treat it as signedDate when stated.
- "completeWithinMonths" (per project): if the document says the work must be completed/published within N months (or a number of years × 12) of signing OR "of the Effective Date", return N as a numeric string; else "". (The due date is computed from signedDate/Effective Date + this. E.g. "within eighteen (18) months of the Effective Date" → "18".)
- "licenseTermMonths" (per project): the INITIAL term length the license/agreement is granted for, in months (years × 12). E.g. "for five (5) years from the Effective Date" → "60". Else "".
- "autoRenews" (per project): true if the agreement automatically renews/extends at the end of the term (e.g. "automatically renew for successive one-year periods") unless notice is given; else false.
- "renewalMonths" (per project): the length of each automatic renewal period in months (e.g. "successive one-(1) year periods" → "12"). Else "".
- "renewalNoticeDays" (per project): the number of days' written notice required to terminate / not renew before the term ends (e.g. "sixty (60) days prior to expiration" → "60"). Else "".
- "copyrightHolder" (per project): the party that OWNS the copyright of the work/translation per the Copyright Ownership clause (e.g. "Crossway is the sole owner of the Work"). Often the same as licenseHolder. Else "".
- "copyrightNotice" (per project): the exact copyright notice block to print when laying out the book, if the document shows one (the "© <year> by <name> … Published by …" lines). Copy it verbatim including line breaks. Else "".
- "publicationDate" (per project): only if the document states an explicit publication/completion DATE; otherwise leave "" (it will be derived from completeWithinMonths).
- "partnerUpdateDate" (per project): if the Publisher must give the partner a progress/status update by a certain time, set that date (yyyy-mm-dd). "the close of the current calendar year" means December 31 of the signing year (e.g. signed in 2025 → 2025-12-31). Else "".
- Each project's "title" is the work being published (e.g. "Don't Waste Your Life"), not the agreement's name.
- "kind" (per project): the medium of the work. Use "podcast" when it is an episodic AUDIO/podcast series (mentions "episodes", "podcast", audio distribution on Spotify/Anchor/YouTube). Use "video_series" when it is an episodic VIDEO series — a run of individual videos, e.g. testimony videos, course/lesson videos, or a video devotional series (set "episodeCount" to the number of videos). Use "book" for a book/manuscript, "article" for either one article or a collection/series managed as one article project, and "other" if unclear. Default "book" for a typical book license.
- "videoProductionMode" (video_series only): use "translation" when the videos adapt or translate supplied source-language scripts/content; use "original" when the team will develop the concept and script. Default to "original" when the document is unclear. Leave empty for non-video projects.
- "obligations" (per project): the STANDING duties the Publisher must honor to stay compliant (breaching them can terminate the license). Copy each into "text" VERBATIM with its clause number in "clauseRef". Classify: an audio/attribution cue that must appear in every episode → kind "attribution", cadence "per_episode"; approval of artwork/cover by the licensor → kind "artwork_approval", cadence "per_artwork"; a required copyright/credit notice wherever published → kind "copyright_notice", cadence "on_publish"; a periodic report to the licensor (e.g. quarterly analytics/statistics) → kind "analytics_report", cadence "quarterly" (use "monthly" or "annual" instead if the document states that reporting period); distribution/format limits → "format_restriction"/"standing"; territory limits → "territory_restriction"/"standing"; sample-copy delivery → "sample_delivery"/"standing"; otherwise "other"/"standing". For a periodic report, set "firstDueDate" only when the agreement states an explicit first/calendar deadline; otherwise use "" so the app can apply its default cadence (annual reports default to January 31 of the following calendar year). Give each a short "label". Return an empty array if the document lists no such duties. Do NOT duplicate the copyrightNotice block here unless the clause also imposes a placement duty.
- "formats": the formats this agreement actually grants for the CURRENT scope. Preserve non-commercial format rights when they are granted; "nonCommercialOnly" records that they may not be sold. Set all formats false only when rightsGrantedByAgreement is false. Default false.
- Even when formats are false (rights not yet secured), STILL capture the agreed print run in "maxCopies" (e.g. "1,000 copies") and any fees in "budgetLines" (e.g. an advance royalty/license fee) — those are recorded regardless of whether rights are granted.
- "budgetLines": if the document contains an itemized budget/quotation table or lists separate costs/fees (e.g. translation cost AND a separate license/royalty fee), copy EACH as its own line — do not merge them. Map each to the closest "category": translation, proofreading, editing, cover_design, typesetting, project_management, print_ship, audiobook, video_series — use "custom" when none fits (e.g. a royalty or license fee). Choose "unit" from words/pages/cover/project/flat. Put the row's stated total in "amount". Include quantity and unitPrice only when the same row explicitly prices the work that way and verify quantity × unitPrice equals amount. If the row states only a total, use unit "flat" and leave quantity and unitPrice empty; never reuse a manuscript page count, word count, or print-run count as the quantity for a flat total. Preserve the document's numbers exactly. List each distinct cost ONCE — do not add a second line for the same cost because the document mentions it again in another place.
- For each installment extract deliveryRequirements as separate required deliverables (including stated formats such as DOCX translations, MP3 audio, MP4 videos), and sourceClause with the source wording. Do not infer delivery conditions from file formats merely licensed. Empty deliveryRequirements means none stated.
- Root "mouPaymentSchedule": extract payments the partner owes the workspace organization under the MoU/grant, separate from project budgets. Use trigger "on_signing" for signing/execution; "on_completion" for completion of all covered work; "on_52_episodes" for an episode milestone; otherwise "custom". Put the stated amount in "amount". If the agreement states a total paid in N equal installments without a per-installment figure, set agreementTotalAmount and split it evenly. Use dueDate only for an explicit calendar/no-earlier-than date. Preserve terms like "payment 1 of 2", "initial", and "final" in notes. Each real payment obligation appears ONCE: if the agreement restates the same payment in more than one clause (e.g. a "total payment upon signing" in clause 5.1 that another clause calls the "advance paid outright"), extract a single row for it — do NOT create a second row for the same money and trigger.
- "wordCount": the manuscript word count if stated. "maxCopies": print run / copy cap if stated. "currency" is the document's actual ISO currency code (e.g. "GBP" for £, "USD" for $). Never relabel a foreign-currency amount as USD; the app performs a reviewed daily-rate conversion after extraction.
- Return EVERY numeric value as a JSON string without currency symbols or grouping commas (for example, "20702", "10351", "0.03"). For a numeric field not stated in the document, use "". Use empty arrays for missing lists and "" for missing text/date fields. NEVER invent numbers, dates, names, or amounts.`;
