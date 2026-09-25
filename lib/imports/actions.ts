"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { defaultProjectChannelRows } from "@/lib/chat/project-channels";
import { db } from "@/lib/db";
import {
  budgetItems,
  budgetScopePresentations,
  chatChannels,
  documentImports,
  fileAttachments,
  files,
  fundingReceipts,
  invoices,
  licenseObligations,
  mouPaymentProjects,
  mouPayments,
  partnerContacts,
  partners,
  projectBudgetSettings,
  projectPrintSettings,
  projects,
  rightsContacts,
  rightsHolders,
  rightsItems,
  sharedMouGroups,
  sharedMouMembershipAudits,
  sharedMouMemberships,
  tasks,
  units,
} from "@/lib/db/schema";
import { runExtraction } from "./extraction";
import { syncBudgetApprovalState } from "@/lib/budget/approval-service";
import {
  getBudgetPresentation,
  getOrCreateBudgetSettings,
} from "@/lib/budget/queries";
import {
  gateExtractionFormats,
  normalizeExtraction,
} from "./schema";
import type {
  ExtractedBudgetLine,
  ExtractedProject,
  ImportExtraction,
} from "./types";
import { uniqueProjectSlug } from "@/lib/slug";
import { isEpisodicKind } from "@/lib/projects/kinds";
import { insertEpisodicUnitsWithWorkflow } from "@/lib/episodes/materialize";
import { workflowProfile } from "@/lib/episodes/workflow";
import { norm } from "./match";
import { deriveOverall, type RightsStep } from "@/lib/rights/derive";
import {
  expectedNetCents,
  groupForCategory,
  lineAmount,
} from "@/lib/budget/compute";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { generateObligationTasksForProject } from "@/lib/obligations/generate";
import { logActivity } from "@/lib/activity/log";
import {
  budgetPartnerFromExtraction,
  hasInboundAgreementFunding,
} from "@/lib/imports/partner";
import {
  fundsSecured,
  resolvePaymentProjectIndex,
  sharedMouAllocationsReconcile,
  shouldCreateSharedMouGroup,
} from "@/lib/imports/payments";
import { podcastEpisodesToCreate } from "@/lib/imports/podcast-workflow";
import { reevaluateSharedMouPayments } from "@/lib/agreements/readiness-engine";
import { findHolderMatch } from "@/lib/rights/holder-match";
import { enqueueAndProcessAgreementDocumentsForFile } from "@/lib/agreement-chat/indexing";
import {
  getInvoiceIssuerSnapshot,
  getWorkspaceSettings,
} from "@/lib/workspace/queries";

/**
 * A "parsing" import untouched for longer than this is treated as stalled (e.g.
 * its background job was lost to a redeploy) and is safe to re-kick. Kept above
 * the per-step timeouts in `runExtraction` so a live attempt always fails first.
 */
const STALE_PARSE_MS = 3 * 60 * 1000;

/** Reject if `p` doesn't settle within `ms` — keeps a hung parse from sticking. */
/** Create an import draft for an already-uploaded file; returns its id. */
export async function createImportFromFile(
  fileId: string
): Promise<{ importId?: string; error?: string }> {
  const { user } = await requireRole("manager");
  const [file] = await db
    .select({ id: files.id })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file) return { error: "File not found." };

  const [imp] = await db
    .insert(documentImports)
    .values({ fileId, status: "parsing", createdBy: user.id })
    .returning({ id: documentImports.id });
  // Parse server-side after the response — survives the user navigating away.
  after(() => runExtraction(imp.id));
  revalidatePath("/projects/import");
  return { importId: imp.id };
}

/** Start an invoice import from one scheduled MoU payment row. */
export async function createImportForPaymentInvoice(
  fileId: string,
  paymentId: string
): Promise<{ importId?: string; error?: string }> {
  const { user } = await requireRole("manager");
  const [payment] = await db
    .select({
      id: mouPayments.id,
      projectId: mouPayments.projectId,
      sharedMouGroupId: mouPayments.sharedMouGroupId,
    })
    .from(mouPayments)
    .where(eq(mouPayments.id, paymentId))
    .limit(1);
  if (!payment) return { error: "Scheduled payment not found." };
  if (payment.sharedMouGroupId) {
    return { error: "Upload shared-agreement invoices from the agreement page." };
  }
  const [file] = await db
    .select({ id: files.id })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file) return { error: "File not found." };

  const [imp] = await db
    .insert(documentImports)
    .values({
      fileId,
      targetProjectId: payment.projectId,
      targetMouPaymentId: payment.id,
      status: "parsing",
      createdBy: user.id,
    })
    .returning({ id: documentImports.id });
  after(() => runExtraction(imp.id));
  revalidatePath("/projects/import");
  return { importId: imp.id };
}

/** Flatten an XLSX workbook into tab-separated text for the model. */
/**
 * Start (or restart) parsing server-side and return immediately. Used to retry a
 * failed parse or recover one that stalled. The heavy work runs via `after()`.
 */
export async function startParse(
  importId: string,
  opts?: { force?: boolean }
): Promise<{ error?: string; status?: string }> {
  await requireRole("manager");
  const [imp] = await db
    .select()
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp) return { error: "Import not found." };
  if (imp.status === "committed") return { error: "Already committed." };
  // `force` lets the review screen re-run extraction (e.g. to pick up a better
  // prompt); it overwrites the prior extraction.
  if (imp.status === "extracted" && !opts?.force) return { status: "extracted" };

  // Already running and recent? Don't kick off a duplicate (unless forced).
  const fresh =
    imp.status === "parsing" &&
    Date.now() - imp.updatedAt.getTime() < STALE_PARSE_MS;
  if (opts?.force || !fresh) {
    await db
      .update(documentImports)
      .set({ status: "parsing", error: null, updatedAt: new Date() })
      .where(eq(documentImports.id, importId));
    after(() => runExtraction(importId));
  }
  return { status: "parsing" };
}

/**
 * Re-kick any parse that stalled — status "parsing" but untouched beyond
 * STALE_PARSE_MS (e.g. the background `after()` job was lost to a redeploy). The
 * import list polls this so stuck rows self-heal when a manager views the page.
 * The staleness predicate is applied in the UPDATE itself, so concurrent callers
 * won't double-kick the same row.
 */
export async function resumeStalledImports(): Promise<{ resumed: number }> {
  await requireRole("manager");
  const cutoff = new Date(Date.now() - STALE_PARSE_MS);
  const resumed = await db
    .update(documentImports)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(documentImports.status, "parsing"),
        lt(documentImports.updatedAt, cutoff)
      )
    )
    .returning({ id: documentImports.id });
  for (const r of resumed) after(() => runExtraction(r.id));
  if (resumed.length > 0) revalidatePath("/projects/import");
  return { resumed: resumed.length };
}

/** Lightweight poll target: current parse status (+ extraction once ready). */
export async function getImportStatus(
  importId: string
): Promise<{ status: string; error: string | null; extraction: ImportExtraction | null }> {
  await requireRole("manager");
  const [imp] = await db
    .select({
      status: documentImports.status,
      error: documentImports.error,
      reviewed: documentImports.reviewed,
      extraction: documentImports.extraction,
    })
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp) return { status: "failed", error: "Import not found.", extraction: null };
  return {
    status: imp.status,
    error: imp.error,
    extraction:
      imp.status === "extracted" && (imp.reviewed ?? imp.extraction)
        ? normalizeExtraction(imp.reviewed ?? imp.extraction)
        : null,
  };
}

/** Persist the manager's edits to the reviewed copy. */
export async function updateImportDraft(
  importId: string,
  reviewed: ImportExtraction
): Promise<{ error?: string }> {
  await requireRole("manager");
  const [imp] = await db
    .select({ status: documentImports.status })
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp) return { error: "Import not found." };
  if (imp.status === "committed") return { error: "Already committed." };

  let clean: ImportExtraction;
  try {
    clean = normalizeExtraction(reviewed);
  } catch {
    return { error: "Invalid data." };
  }
  await db
    .update(documentImports)
    .set({ reviewed: clean, status: "extracted", updatedAt: new Date() })
    .where(eq(documentImports.id, importId));
  return {};
}

/** Mark an import discarded (soft hide from the list). */
export async function discardImport(importId: string): Promise<void> {
  await requireRole("manager");
  await db
    .update(documentImports)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(eq(documentImports.id, importId));
  revalidatePath("/projects/import");
}

const isoDate = (s: string | null): string | null =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;

/** Map extracted budget lines into `budget_items` insert rows for a project. */
function budgetRowsFor(
  projectId: string,
  lines: ExtractedBudgetLine[],
  currency: string,
  startOrder = 0,
  // When the agreement commits funding (an MoU/grant), pre-fill "Raised"
  // (amountSecured) so a funded project isn't flagged with a false budget
  // blocker; license-only imports leave it 0 (no funding stated).
  secured = false
) {
  return lines.map((l, idx) => {
    let quantity: number;
    let unitPrice: number;
    let amount: string;
    let unit = l.unit;
    if (l.quantity != null && l.unitPrice != null) {
      quantity = l.quantity;
      unitPrice = l.unitPrice;
      amount =
        l.amount != null
          ? l.amount.toFixed(2)
          : lineAmount(String(quantity), String(unitPrice));
    } else if (l.amount != null) {
      // Only a total was stated → represent as a flat 1 × total line.
      quantity = 1;
      unitPrice = l.amount;
      amount = l.amount.toFixed(2);
      unit = "flat";
    } else {
      quantity = l.quantity ?? 0;
      unitPrice = l.unitPrice ?? 0;
      amount = lineAmount(String(quantity), String(unitPrice));
    }
    return {
      projectId,
      group: groupForCategory(l.category),
      category: l.category,
      label: l.label,
      sortOrder: startOrder + idx,
      unit,
      quantity: String(quantity),
      unitPrice: String(unitPrice),
      amount,
      isAutoQuantity: false,
      amountSecured: secured ? amount : "0",
      currency,
      notes: l.notes,
    };
  });
}

function mouPaymentRowsFor(
  projectId: string,
  data: ImportExtraction,
  currency: string,
  userId: string,
  coveredProjects: Array<{ title: string; publicationDate: string | null }>,
  sharedMouGroupId?: string | null
) {
  const completionDate = coveredProjects
    .map((project) => isoDate(project.publicationDate))
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1);
  const coverageNote =
    coveredProjects.length > 1
      ? `Shared agreement payment covering ${coveredProjects.map((project) => project.title).join(", ")}.`
      : null;
  return data.mouPaymentSchedule.map((payment) => {
    const dueDate =
      isoDate(payment.dueDate) ??
      (payment.trigger === "on_signing"
        ? isoDate(data.signedDate)
        : payment.trigger === "on_completion" && !sharedMouGroupId
          ? completionDate ?? null
          : null);
    const paymentNotes =
      payment.notes?.trim() ||
      (payment.trigger === "on_signing"
        ? "Initial invoice on MoU signing"
        : payment.trigger === "on_completion"
          ? "Final invoice when project is complete"
          : payment.trigger === "on_52_episodes"
            ? "Payment after episode milestone"
            : "MoU payment");
    const notes = coverageNote
      ? `${paymentNotes} ${coverageNote}`
      : paymentNotes;

    return {
      projectId,
      sharedMouGroupId: sharedMouGroupId ?? null,
      amount: (payment.amount ?? 0).toFixed(2),
      currency,
      trigger: payment.trigger,
      dueDate,
      notes,
      createdBy: userId,
    };
  });
}

async function insertAgreementPayments(
  tx: Tx,
  ownerProjectId: string,
  data: ImportExtraction,
  currency: string,
  userId: string,
  coveredProjects: Array<{
    id: string;
    title: string;
    publicationDate: string | null;
  }>,
  sharedMouGroupId?: string | null
) {
  const rows = mouPaymentRowsFor(
    ownerProjectId,
    data,
    currency,
    userId,
    coveredProjects,
    sharedMouGroupId
  );
  if (rows.length === 0) return;

  const existing = await tx
    .select({
      id: mouPayments.id,
      trigger: mouPayments.trigger,
      amount: mouPayments.amount,
      dueDate: mouPayments.dueDate,
      notes: mouPayments.notes,
    })
    .from(mouPayments)
    .where(eq(mouPayments.projectId, ownerProjectId));
  const keys = new Set(
    existing.map((p) => `${p.trigger}|${p.amount}|${p.dueDate ?? ""}|${p.notes ?? ""}`)
  );
  for (const row of rows) {
    const key = `${row.trigger}|${row.amount}|${row.dueDate ?? ""}|${row.notes ?? ""}`;
    let paymentId = existing.find(
      (payment) =>
        `${payment.trigger}|${payment.amount}|${payment.dueDate ?? ""}|${payment.notes ?? ""}` ===
        key
    )?.id;
    if (!paymentId && !keys.has(key)) {
      const [created] = await tx
        .insert(mouPayments)
        .values(row)
        .returning({ id: mouPayments.id });
      paymentId = created.id;
      keys.add(key);
    }
    if (paymentId && coveredProjects.length > 0 && !sharedMouGroupId) {
      await tx
        .insert(mouPaymentProjects)
        .values(
          coveredProjects.map((project) => ({
            paymentId,
            projectId: project.id,
          }))
        )
        .onConflictDoNothing();
    }
  }
}

/** The transaction handle drizzle passes to `db.transaction(tx => …)`. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Bulk-create imported episodic units with their complete standard workflow. */
async function insertPodcastEpisodesWithWorkflow(
  tx: Tx,
  input: {
    projectId: string;
    count: number;
    actorId: string;
    videoRequired: boolean;
    videoProductionMode?: "original" | "translation" | null;
    projectKind?: "podcast" | "video_series";
    startIndex?: number;
    videoRequiredOverride?: boolean | null;
    /** Unit noun, capitalized — "Episode" for podcasts, "Video" for a video series. */
    unitNoun?: string;
  }
): Promise<void> {
  const startIndex = input.startIndex ?? 0;
  const unitNoun = input.unitNoun ?? "Episode";
  const unitNames = Array.from(
    { length: Math.min(input.count, 500) },
    (_, index) => `${unitNoun} ${startIndex + index + 1}`
  );
  await insertEpisodicUnitsWithWorkflow(tx, {
    projectId: input.projectId,
    actorId: input.actorId,
    profile: workflowProfile({
      kind: input.projectKind ?? "podcast",
      videoProductionMode: input.videoProductionMode,
      videoRequired: input.videoRequired,
    }),
    unitNames,
    startIndex,
  });
}

async function materializePodcastEpisodesFromImport(
  tx: Tx,
  projectId: string,
  project: ExtractedProject,
  actorId: string
): Promise<void> {
  const [storedProject] = await tx
    .select({
      kind: projects.kind,
      videoProductionMode: projects.videoProductionMode,
      videoRequired: projects.videoRequired,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const effectiveKind = storedProject?.kind ?? project.kind;
  if (
    !isEpisodicKind(effectiveKind) ||
    project.episodeCount == null ||
    project.episodeCount <= 0
  ) {
    return;
  }
  const [stats] = await tx
    .select({
      count: sql<number>`count(*)::int`,
      maxOrder: sql<number>`coalesce(max(${units.orderIndex}), -1)::int`,
    })
    .from(units)
    .where(eq(units.projectId, projectId));
  const count = podcastEpisodesToCreate(
    Number(stats?.count ?? 0),
    project.episodeCount,
    project.episodeCountMode
  );
  if (count === 0) return;
  // A video series is video-first (video always required); a podcast is
  // audio-first with optional video from the granted formats.
  const videoRequired =
    effectiveKind === "video_series"
      ? true
      : storedProject?.videoRequired ?? project.formats.video;
  await insertPodcastEpisodesWithWorkflow(tx, {
    projectId,
    count,
    actorId,
    videoRequired,
    startIndex: Number(stats?.maxOrder ?? -1) + 1,
    videoRequiredOverride: videoRequired,
    unitNoun: effectiveKind === "video_series" ? "Video" : "Episode",
    projectKind: effectiveKind === "video_series" ? "video_series" : "podcast",
    videoProductionMode:
      effectiveKind === "video_series"
        ? storedProject?.videoProductionMode ?? project.videoProductionMode
        : null,
  });
}

/** Find-or-create the document's rights holder (+ contact), once per document. */
/** Find a rights holder by name (case-insensitive), creating it if absent. */
async function upsertHolderByName(
  tx: Tx,
  name: string
): Promise<string> {
  const holders = await tx
    .select({ id: rightsHolders.id, name: rightsHolders.name })
    .from(rightsHolders);
  const existing = findHolderMatch(name, holders);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(rightsHolders)
    .values({ name })
    .returning({ id: rightsHolders.id });
  return created.id;
}

/** Add whole months to a yyyy-mm-dd date (day clamped to month length). */
function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

async function resolveHolder(tx: Tx, data: ImportExtraction): Promise<string | null> {
  const partner = data.partnerOrg?.trim();
  if (!partner) return null;
  const holders = await tx
    .select({ id: rightsHolders.id, name: rightsHolders.name })
    .from(rightsHolders);
  const existing = findHolderMatch(partner, holders);
  const holderId =
    existing?.id ??
    (
      await tx
        .insert(rightsHolders)
        .values({ name: partner })
        .returning({ id: rightsHolders.id })
    )[0].id;

  const contactName = data.contactName?.trim();
  if (contactName) {
    const [dupe] = await tx
      .select({ id: rightsContacts.id })
      .from(rightsContacts)
      .where(
        sql`${rightsContacts.holderId} = ${holderId} and lower(${rightsContacts.name}) = lower(${contactName})`
      )
      .limit(1);
    if (!dupe) {
      await tx.insert(rightsContacts).values({
        holderId,
        name: contactName,
        email: data.contactEmail?.trim() || null,
        phone: data.contactPhone?.trim() || null,
      });
    }
  }
  return holderId;
}

/**
 * Find-or-create a funding Partner (+ a contact) from the extracted sponsor /
 * MoU counterparty, so the Partners directory fills itself from imports.
 * Idempotent by org name and by contact email/name. A normal license-only
 * agreement is skipped, but a license with inbound receivables links its payer.
 */
async function resolvePartner(
  tx: Tx,
  data: ImportExtraction
): Promise<{ partnerId: string | null; partnerContactId: string | null }> {
  if (
    data.agreementType === "license_only" &&
    !hasInboundAgreementFunding(data)
  ) {
    return { partnerId: null, partnerContactId: null };
  }
  const org = data.partnerOrg?.trim();
  if (!org) return { partnerId: null, partnerContactId: null };

  const [existing] = await tx
    .select({ id: partners.id })
    .from(partners)
    .where(sql`lower(${partners.name}) = lower(${org})`)
    .limit(1);
  const partnerId =
    existing?.id ??
    (
      await tx.insert(partners).values({ name: org }).returning({
        id: partners.id,
      })
    )[0].id;

  const contactName = data.contactName?.trim();
  const email = data.contactEmail?.trim() || null;
  const phone = data.contactPhone?.trim() || null;
  if (!contactName && !email) return { partnerId, partnerContactId: null };

  const [dupe] = await tx
    .select({ id: partnerContacts.id })
    .from(partnerContacts)
    .where(
      email
        ? sql`${partnerContacts.partnerId} = ${partnerId} and lower(${partnerContacts.email}) = lower(${email})`
        : sql`${partnerContacts.partnerId} = ${partnerId} and lower(trim(coalesce(${partnerContacts.firstName}, '') || ' ' || coalesce(${partnerContacts.lastName}, ''))) = lower(${contactName})`
    )
    .limit(1);
  if (dupe) return { partnerId, partnerContactId: dupe.id };

  const parts = (contactName ?? "").split(/\s+/).filter(Boolean);
  const [inserted] = await tx
    .insert(partnerContacts)
    .values({
      partnerId,
      firstName: parts[0] || null,
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
      email,
      phone,
      // A brand-new partner's first contact becomes its primary.
      isPrimary: !existing,
    })
    .returning({ id: partnerContacts.id });
  return { partnerId, partnerContactId: inserted.id };
}

export type BudgetMode = "add" | "replace" | "skip";

/**
 * Merge a reviewed extraction into an EXISTING project. Budget can add/replace/
 * skip; rights advance and LAYER (a license added to an MoU stays mou_plus_license,
 * never collapses to license_only); details are optional. Shared by the dedicated
 * update flow and the batch "update existing" path.
 */
async function mergeProjectFromExtraction(
  tx: Tx,
  opts: {
    projectId: string;
    proj: ExtractedProject;
    data: ImportExtraction;
    holderId: string | null;
    partnerLink: { partnerId: string | null; partnerContactId: string | null };
    fileId: string | null;
    userId: string;
    applyDescription: boolean;
    applyDates: boolean;
    budgetMode: BudgetMode;
    applyRights: boolean;
  }
): Promise<void> {
  const { projectId, proj, data, holderId, partnerLink, fileId, userId } = opts;
  const partner = data.partnerOrg?.trim();
  const budgetPartner = budgetPartnerFromExtraction(data);
  const currency = proj.currency?.trim() || "USD";

  // ── Details: description and dates are independent; never touch title/slug ──
  if (opts.applyDescription || opts.applyDates) {
    const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (opts.applyDescription && proj.description != null)
      patch.description = proj.description;
    if (opts.applyDates) {
      if (isoDate(proj.startDate)) patch.startDate = isoDate(proj.startDate);
      if (isoDate(proj.publicationDate)) patch.dueDate = isoDate(proj.publicationDate);
    }
    if (Object.keys(patch).length > 1)
      await tx.update(projects).set(patch).where(eq(projects.id, projectId));
  }

  // The reviewed agreement can establish the funding relationship without an
  // itemized quotation. Link its payer on Budget without touching quote lines.
  if (budgetPartner.partnerName) {
    await tx
      .insert(projectBudgetSettings)
      .values({
        projectId,
        currency,
        partnerName: budgetPartner.partnerName,
        partnerContactFirstName: budgetPartner.partnerContactFirstName,
        partnerContactLastName: budgetPartner.partnerContactLastName,
        partnerContactEmail: budgetPartner.partnerContactEmail,
        partnerContact: budgetPartner.partnerContact,
        partnerId: partnerLink.partnerId,
        partnerContactId: partnerLink.partnerContactId,
      })
      .onConflictDoUpdate({
        target: projectBudgetSettings.projectId,
        set: {
          partnerName: budgetPartner.partnerName,
          partnerContactFirstName: budgetPartner.partnerContactFirstName,
          partnerContactLastName: budgetPartner.partnerContactLastName,
          partnerContactEmail: budgetPartner.partnerContactEmail,
          partnerContact: budgetPartner.partnerContact,
          partnerId: partnerLink.partnerId,
          partnerContactId: partnerLink.partnerContactId,
          updatedAt: new Date(),
        },
      });
  }

  // ── Budget: add the document's lines, replace the budget, or leave it ──
  if (opts.budgetMode !== "skip" && proj.budgetLines.length > 0) {
    if (opts.budgetMode === "replace") {
      // A full revision — overwrite settings and the line set.
      await tx
        .insert(projectBudgetSettings)
        .values({
          projectId,
          wordCount: proj.wordCount ?? 0,
          currency,
          partnerName: budgetPartner.partnerName,
          partnerContactFirstName: budgetPartner.partnerContactFirstName,
          partnerContactLastName: budgetPartner.partnerContactLastName,
          partnerContactEmail: budgetPartner.partnerContactEmail,
          partnerContact: budgetPartner.partnerContact,
          partnerId: partnerLink.partnerId,
          partnerContactId: partnerLink.partnerContactId,
          workDescription: proj.description ?? null,
        })
        .onConflictDoUpdate({
          target: projectBudgetSettings.projectId,
          set: {
            ...(proj.wordCount != null ? { wordCount: proj.wordCount } : {}),
            currency,
            ...(budgetPartner.partnerName
              ? { partnerName: budgetPartner.partnerName }
              : {}),
            ...(budgetPartner.partnerContact
              ? { partnerContact: budgetPartner.partnerContact }
              : {}),
            ...(budgetPartner.partnerContactFirstName
              ? {
                  partnerContactFirstName:
                    budgetPartner.partnerContactFirstName,
                }
              : {}),
            ...(budgetPartner.partnerContactLastName
              ? {
                  partnerContactLastName:
                    budgetPartner.partnerContactLastName,
                }
              : {}),
            ...(budgetPartner.partnerContactEmail
              ? { partnerContactEmail: budgetPartner.partnerContactEmail }
              : {}),
            ...(partnerLink.partnerId
              ? {
                  partnerId: partnerLink.partnerId,
                  partnerContactId: partnerLink.partnerContactId,
                }
              : {}),
            updatedAt: new Date(),
          },
        });
      await tx.delete(budgetItems).where(eq(budgetItems.projectId, projectId));
      await tx
        .insert(budgetItems)
        .values(
          budgetRowsFor(
            projectId,
            proj.budgetLines,
            currency,
            0,
            fundsSecured(data)
          )
        );
    } else {
      // Add — append the document's lines after the existing ones (per-line
      // currency is preserved, so e.g. a £50 GBP royalty can join a USD budget).
      const existing = await tx
        .select({ id: budgetItems.id })
        .from(budgetItems)
        .where(eq(budgetItems.projectId, projectId));
      await tx
        .insert(budgetItems)
        .values(
          budgetRowsFor(
            projectId,
            proj.budgetLines,
            currency,
            existing.length,
            fundsSecured(data)
          )
        );
    }
  }

  // ── Rights (advance + layer, never downgrade) ──
  if (opts.applyRights) {
    await tx
      .insert(rightsItems)
      .values({ projectId, createdBy: userId })
      .onConflictDoNothing({ target: rightsItems.projectId });
    const [cur] = await tx
      .select()
      .from(rightsItems)
      .where(eq(rightsItems.projectId, projectId))
      .limit(1);

    let licenseHolderId: string | null = holderId ?? cur.licenseHolderId;
    const lh = proj.licenseHolder?.trim();
    if (lh) {
      licenseHolderId = await upsertHolderByName(tx, lh);
    }

    const signed = !!isoDate(data.signedDate);
    const type = data.agreementType;
    // LAYER the agreement type: keep whichever steps the existing record OR the
    // new document has. Adding a license to an MoU → mou_plus_license, never
    // collapses the MoU into license_only.
    const hasMou = cur.agreementType !== "license_only" || type !== "license_only";
    const hasLicense = cur.agreementType !== "mou_only" || type !== "mou_only";
    const mergedType: ImportExtraction["agreementType"] =
      hasMou && hasLicense ? "mou_plus_license" : hasMou ? "mou_only" : "license_only";

    let mouStatus: RightsStep =
      signed && type !== "license_only" ? "signed" : cur.mouStatus;
    let licenseStatus: RightsStep =
      signed && type === "license_only" ? "signed" : cur.licenseStatus;
    // A step that's now relevant but was "not_needed" becomes "not_started".
    if (hasMou && mouStatus === "not_needed") mouStatus = "not_started";
    if (hasLicense && licenseStatus === "not_needed") licenseStatus = "not_started";

    const patch: Partial<typeof rightsItems.$inferInsert> = {
      agreementType: mergedType,
      mouStatus,
      licenseStatus,
      formatPrint: cur.formatPrint || proj.formats.print,
      formatEbook: cur.formatEbook || proj.formats.ebook,
      formatAudio: cur.formatAudio || proj.formats.audio,
      formatVideo: cur.formatVideo || proj.formats.video,
      overallStatus: deriveOverall(mergedType, mouStatus, licenseStatus),
      updatedAt: new Date(),
    };
    if (signed && type !== "license_only") patch.mouSignedDate = isoDate(data.signedDate);
    if (signed && type === "license_only")
      patch.licenseSignedDate = isoDate(data.signedDate);
    // Set the MoU holder only from an MoU/grant doc; the license holder only
    // from a license doc — so neither overwrites the other.
    if (holderId && type !== "license_only") patch.mouHolderId = holderId;
    if (licenseHolderId && type !== "mou_only") patch.licenseHolderId = licenseHolderId;
    if (isoDate(proj.startDate)) patch.rightsStartDate = isoDate(proj.startDate);
    if (isoDate(proj.publicationDate)) patch.completeByDate = isoDate(proj.publicationDate);
    if (proj.maxCopies != null) patch.maxCopies = proj.maxCopies;
    if (proj.paymentTerms != null) patch.notes = proj.paymentTerms;
    if (signed && type === "license_only") patch.commercialGranted = true;

    // ── License term + renewal + copyright (layer in, don't clobber) ──
    if (proj.licenseTermMonths != null) patch.licenseTermMonths = proj.licenseTermMonths;
    if (proj.autoRenews) patch.licenseAutoRenews = true;
    if (proj.renewalMonths != null) patch.licenseRenewalMonths = proj.renewalMonths;
    if (proj.renewalNoticeDays != null)
      patch.licenseRenewalNoticeDays = proj.renewalNoticeDays;
    const effective = isoDate(data.signedDate) ?? isoDate(proj.startDate);
    if (proj.licenseTermMonths != null && effective && !cur.licenseExpiresDate) {
      patch.licenseExpiresDate = addMonthsIso(effective, proj.licenseTermMonths);
    }
    if (!cur.licenseRenewalAssignedTo && !proj.autoRenews) {
      patch.licenseRenewalAssignedTo = userId; // default owner = importer
    }
    if (proj.copyrightNotice && !cur.copyrightNotice)
      patch.copyrightNotice = proj.copyrightNotice;
    const ch = proj.copyrightHolder?.trim();
    if (ch && !cur.copyrightHolderId)
      patch.copyrightHolderId = await upsertHolderByName(tx, ch);

    await tx.update(rightsItems).set(patch).where(eq(rightsItems.projectId, projectId));
  }

  // ── Partner progress-update milestone (deduped by title) ──
  if (isoDate(proj.partnerUpdateDate)) {
    const title = `Progress update to ${partner ?? "partner"}`;
    const [dupe] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(sql`${tasks.projectId} = ${projectId} and ${tasks.title} = ${title}`)
      .limit(1);
    if (!dupe) {
      await tx.insert(tasks).values({
        projectId,
        title,
        status: "todo",
        priority: "medium",
        dueDate: isoDate(proj.partnerUpdateDate),
        isMilestone: true,
        createdBy: userId,
      });
    }
  }

  // ── Attach the source document to the project + rights record ──
  if (fileId) {
    const [r] = await tx
      .select({ id: rightsItems.id })
      .from(rightsItems)
      .where(eq(rightsItems.projectId, projectId))
      .limit(1);
    const rightsLabel = data.agreementType === "license_only" ? "license" : "mou";
    await tx.insert(fileAttachments).values([
      { fileId, targetType: "project" as const, targetId: projectId, label: "agreement" },
      ...(r
        ? [
            {
              fileId,
              targetType: "rights_item" as const,
              targetId: r.id,
              label: rightsLabel,
            },
          ]
        : []),
    ]);
  }
}

/** Per-project commit decision: create a new project, or update an existing one. */
export type CommitDecision = {
  index: number;
  mode: "create" | "update";
  projectId?: string;
};

/** Commit a reviewed import: create new projects and/or update existing ones. */
export async function commitImport(
  importId: string,
  decisions: CommitDecision[]
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [imp] = await db
    .select()
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp) return { error: "Import not found." };
  // Idempotency: never commit twice from one import.
  if (imp.status === "committed" || (imp.committedProjectIds?.length ?? 0) > 0) {
    redirect("/projects");
  }
  if (imp.fundingSourceKey) return { error: "Approve email funding from its MoU funding review." };
  const rawData = imp.reviewed ?? imp.extraction;
  if (!rawData) return { error: "Nothing to commit — parse the document first." };
  const data = gateExtractionFormats(normalizeExtraction(rawData));
  const workspace = await getWorkspaceSettings();

  const valid = decisions.filter((d) => {
    const p = data.projects[d.index];
    return (
      !!p &&
      !!p.title.trim() &&
      (d.mode === "create" || (d.mode === "update" && !!d.projectId))
    );
  });
  if (valid.length === 0) return { error: "Select at least one project." };
  const selectedProjectIndices = valid.map((decision) => decision.index);
  const createsSharedGroup = shouldCreateSharedMouGroup(
    data,
    selectedProjectIndices
  );
  const paymentOwnerIndex = resolvePaymentProjectIndex(
    data,
    valid.map((decision) => decision.index)
  );
  if (
    data.mouPaymentSchedule.length > 0 &&
    !createsSharedGroup &&
    paymentOwnerIndex == null
  ) {
    return {
      error:
        "Choose which selected project should administer the agreement-level payment schedule.",
    };
  }
  if (createsSharedGroup) {
    if (!sharedMouAllocationsReconcile(data, selectedProjectIndices)) {
      return {
        error:
          "Shared completion group allocations must exactly equal the agreement total before committing.",
      };
    }
  }

  // Guard: don't silently mint a near-duplicate (e.g. "the-trinity-2") when a
  // project with the same normalized title already exists — which happens when a
  // sibling import in the same batch was committed first. Steer to "Update".
  const creating = valid.filter((d) => d.mode === "create");
  if (creating.length > 0) {
    const existing = await db.select({ title: projects.title }).from(projects);
    const existingTitles = new Set(existing.map((p) => norm(p.title)));
    for (const d of creating) {
      const title = data.projects[d.index].title.trim();
      if (existingTitles.has(norm(title))) {
        return {
          error: `A project named “${title}” already exists. Open this import and choose “Update existing” instead of creating a duplicate.`,
        };
      }
    }
  }

  // Pre-resolve slugs for CREATE decisions (uniqueProjectSlug reads live db).
  const takenSlugs = new Set<string>();
  const slugs = new Map<number, string>();
  for (const d of valid) {
    if (d.mode === "create") {
      slugs.set(
        d.index,
        await uniqueProjectSlug(data.projects[d.index].title, takenSlugs)
      );
    }
  }
  const committedIds: string[] = [];
  const committedByIndex = new Map<number, string>();
  let createdSharedMouGroupId: string | null = null;

  await db.transaction(async (tx) => {
    const holderId = await resolveHolder(tx, data);
    const partnerLink = await resolvePartner(tx, data);
    const partner = data.partnerOrg?.trim();
    const budgetPartner = budgetPartnerFromExtraction(data);

    for (const d of valid) {
      const proj = data.projects[d.index];

      // ── Update an existing project (matched duplicate) ──
      if (d.mode === "update" && d.projectId) {
        await mergeProjectFromExtraction(tx, {
          projectId: d.projectId,
          proj,
          data,
          holderId,
          partnerLink,
          fileId: createsSharedGroup ? null : imp.fileId,
          userId: user.id,
          // Batch defaults: keep the project's own description/dates,
          // add the document's budget lines (non-destructive), advance rights.
          applyDescription: false,
          applyDates: false,
          budgetMode: "add",
          applyRights: true,
        });
        await materializePodcastEpisodesFromImport(
          tx,
          d.projectId,
          proj,
          user.id
        );
        committedIds.push(d.projectId);
        committedByIndex.set(d.index, d.projectId);
        continue;
      }

      // ── Create a new project ──
      const slug = slugs.get(d.index)!;

      const [project] = await tx
        .insert(projects)
        .values({
          slug,
          title: proj.title.trim(),
          description: proj.description,
          kind: proj.kind ?? null,
          videoProductionMode:
            proj.kind === "video_series"
              ? proj.videoProductionMode ?? "original"
              : null,
          status: "planning",
          priority: "medium",
          startDate: isoDate(proj.startDate),
          dueDate: isoDate(proj.publicationDate),
          videoRequired:
            proj.kind === "podcast" ? proj.formats.video : true,
          sourceLanguage: workspace.sourceLanguage,
          targetLanguage: workspace.targetLanguage,
          createdBy: user.id,
        })
        .returning({ id: projects.id });
      committedIds.push(project.id);
      committedByIndex.set(d.index, project.id);

      await tx.insert(chatChannels).values(defaultProjectChannelRows(project.id));

      const currency = proj.currency?.trim() || workspace.defaultCurrency;

      // ── Budget settings (1:1) ──
      await tx
        .insert(projectBudgetSettings)
        .values({
          projectId: project.id,
          wordCount: proj.wordCount ?? 0,
          wordsPerPage: workspace.wordsPerPage,
          currency,
          rateTranslation: workspace.rateTranslation,
          rateProofreading: workspace.rateProofreading,
          rateEditing: workspace.rateEditing,
          rateCoverDesign: workspace.rateCoverDesign,
          rateTypesetting: workspace.rateTypesetting,
          rateProjectManagement: workspace.rateProjectManagement,
          ratePrintShip: workspace.ratePrintShip,
          rateAudiobook: workspace.rateAudiobook,
          rateVideoSeries: workspace.rateVideoSeries,
          partnerName: budgetPartner.partnerName,
          partnerContactFirstName: budgetPartner.partnerContactFirstName,
          partnerContactLastName: budgetPartner.partnerContactLastName,
          partnerContactEmail: budgetPartner.partnerContactEmail,
          partnerContact: budgetPartner.partnerContact,
          partnerId: partnerLink.partnerId,
          partnerContactId: partnerLink.partnerContactId,
          workDescription: proj.description ?? null,
        })
        .onConflictDoNothing({ target: projectBudgetSettings.projectId });
      await tx.insert(projectPrintSettings).values({
        projectId: project.id,
        trimWidthIn: workspace.trimWidthIn,
        trimHeightIn: workspace.trimHeightIn,
        languageExpansionFactor: workspace.languageExpansionFactor,
        financialEmail: workspace.financialEmail ?? "",
        ccEmails: workspace.defaultCcEmails,
      }).onConflictDoNothing({ target: projectPrintSettings.projectId });
      await tx.insert(budgetScopePresentations).values({
        projectId: project.id,
        mode: "itemized",
        deductionBps: workspace.defaultFundingDeductionBps,
        createdBy: user.id,
        updatedBy: user.id,
      }).onConflictDoNothing();

      // ── Budget lines (only if the document itemized them) ──
      if (proj.budgetLines.length > 0) {
        await tx
          .insert(budgetItems)
          .values(
            budgetRowsFor(
              project.id,
              proj.budgetLines,
              currency,
              0,
              fundsSecured(data)
            )
          );
      }

      // Copyright/license holder — may differ from the funder/MOU partner
      // (e.g. funder 9Marks, but the license must be secured from Union).
      let licenseHolderId = holderId;
      const lh = proj.licenseHolder?.trim();
      if (lh) {
        licenseHolderId = await upsertHolderByName(tx, lh);
      }

      // Progress-update milestone owed to the partner (e.g. end of year).
      if (isoDate(proj.partnerUpdateDate)) {
        await tx.insert(tasks).values({
          projectId: project.id,
          title: `Progress update to ${partner ?? "partner"}`,
          status: "todo",
          priority: "medium",
          dueDate: isoDate(proj.partnerUpdateDate),
          isMilestone: true,
          createdBy: user.id,
        });
      }

      // ── Rights record (1:1) ──
      const signed = !!isoDate(data.signedDate);
      const type = data.agreementType;
      const mouStatus: RightsStep =
        type === "license_only" ? "not_needed" : signed ? "signed" : "not_started";
      const licenseStatus: RightsStep =
        type === "mou_only"
          ? "not_needed"
          : type === "license_only"
            ? signed
              ? "signed"
              : "not_started"
            : "not_started"; // mou_plus_license: license is a pending follow-up

      const effective = isoDate(data.signedDate) ?? isoDate(proj.startDate);
      const licenseExpiresDate =
        proj.licenseTermMonths != null && effective
          ? addMonthsIso(effective, proj.licenseTermMonths)
          : null;
      const ch = proj.copyrightHolder?.trim();
      const copyrightHolderId = ch ? await upsertHolderByName(tx, ch) : null;

      await tx
        .insert(rightsItems)
        .values({
          projectId: project.id,
          agreementType: type,
          mouStatus,
          mouSignedDate:
            type !== "license_only" && signed ? isoDate(data.signedDate) : null,
          mouHolderId: type === "license_only" ? null : holderId,
          licenseStatus,
          licenseSignedDate:
            type === "license_only" && signed ? isoDate(data.signedDate) : null,
          licenseHolderId: type === "mou_only" ? null : licenseHolderId,
          licenseExpiresDate,
          licenseTermMonths: proj.licenseTermMonths ?? null,
          licenseAutoRenews: proj.autoRenews,
          licenseRenewalMonths: proj.renewalMonths ?? null,
          licenseRenewalNoticeDays: proj.renewalNoticeDays ?? null,
          // Renewal reminder defaults to the person importing the project.
          licenseRenewalAssignedTo: proj.autoRenews ? null : user.id,
          copyrightHolderId,
          copyrightNotice: proj.copyrightNotice || null,
          territory: proj.territory || null,
          // A signed license grants commercial rights unless it is restricted to
          // free/non-commercial use (formats can still be held either way).
          commercialGranted:
            signed && type === "license_only" && !proj.nonCommercialOnly,
          formatPrint: proj.formats.print,
          formatEbook: proj.formats.ebook,
          formatAudio: proj.formats.audio,
          formatVideo: proj.formats.video,
          rightsStartDate: isoDate(proj.startDate),
          completeByDate: isoDate(proj.publicationDate),
          maxCopies: proj.maxCopies ?? null,
          notes: proj.paymentTerms ?? null,
          overallStatus: deriveOverall(type, mouStatus, licenseStatus),
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: rightsItems.projectId });

      // ── Attach the source document to the project + rights record ──
      if (imp.fileId && !createsSharedGroup) {
        const [r] = await tx
          .select({ id: rightsItems.id })
          .from(rightsItems)
          .where(eq(rightsItems.projectId, project.id))
          .limit(1);
        const rightsLabel = type === "license_only" ? "license" : "mou";
        await tx.insert(fileAttachments).values([
          {
            fileId: imp.fileId,
            targetType: "project" as const,
            targetId: project.id,
            label: "agreement",
          },
          ...(r
            ? [
                {
                  fileId: imp.fileId,
                  targetType: "rights_item" as const,
                  targetId: r.id,
                  label: rightsLabel,
                },
              ]
            : []),
        ]);
      }

      // ── Episodes (podcast) — materialize the licensed episode count as units ──
      await materializePodcastEpisodesFromImport(
        tx,
        project.id,
        proj,
        user.id
      );

      // ── License obligations (audio cue, artwork approval, © notice, reports) ──
      if (proj.obligations.length > 0) {
        const [rItem] = await tx
          .select({ id: rightsItems.id })
          .from(rightsItems)
          .where(eq(rightsItems.projectId, project.id))
          .limit(1);
        await tx.insert(licenseObligations).values(
          proj.obligations.map((o) => ({
            projectId: project.id,
            rightsItemId: rItem?.id ?? null,
            clauseRef: o.clauseRef,
            kind: o.kind,
            cadence: o.cadence,
            firstDueDate: o.firstDueDate,
            label: o.label,
            text: o.text,
            createdBy: user.id,
          }))
        );
      }
    }

    if (data.mouPaymentSchedule.length > 0) {
      const administrativeIndex = createsSharedGroup
        ? paymentOwnerIndex ?? valid[0].index
        : paymentOwnerIndex;
      if (administrativeIndex == null) {
        throw new Error("Payment owner project was not committed.");
      }
      const ownerProjectId = committedByIndex.get(administrativeIndex);
      if (!ownerProjectId) {
        throw new Error("Payment owner project was not committed.");
      }
      const ownerProject = data.projects[administrativeIndex];
      const coveredProjects = valid.map((decision) => ({
        id: committedByIndex.get(decision.index)!,
        title: data.projects[decision.index].title,
        publicationDate: data.projects[decision.index].publicationDate,
      }));
      let sharedMouGroupId: string | null = null;
      if (createsSharedGroup) {
        const year = data.signedDate?.slice(0, 4);
        const fallbackName = [year ? `FY${year.slice(2)}` : null, data.partnerOrg, "MoU"]
          .filter(Boolean)
          .join(" ");
        const currency = ownerProject.currency?.trim().toUpperCase() || "USD";
        const [group] = await tx
          .insert(sharedMouGroups)
          .values({
            name: data.documentTitle?.trim() || fallbackName || "Shared MoU",
            counterparty: data.partnerOrg?.trim() || null,
            contactName: data.contactName?.trim() || null,
            contactEmail: data.contactEmail?.trim() || null,
            contactPhone: data.contactPhone?.trim() || null,
            signedDate: isoDate(data.signedDate),
            currency,
            agreementTotal: (data.agreementTotalAmount ?? 0).toFixed(2),
            sourceImportId: importId,
            administrativeProjectId: ownerProjectId,
            createdBy: user.id,
          })
          .returning({ id: sharedMouGroups.id });
        sharedMouGroupId = group.id;
        createdSharedMouGroupId = group.id;
        for (const decision of valid) {
          const projectId = committedByIndex.get(decision.index)!;
          const allocation = (data.projects[decision.index].totalAmount ?? 0).toFixed(2);
          const [membership] = await tx
            .insert(sharedMouMemberships)
            .values({
              groupId: group.id,
              projectId,
              allocationAmount: allocation,
              addedBy: user.id,
              addedReason: "Created from reviewed document import.",
            })
            .returning({ id: sharedMouMemberships.id });
          await tx.insert(sharedMouMembershipAudits).values({
            groupId: group.id,
            membershipId: membership.id,
            projectId,
            action: "added",
            previousAllocation: null,
            nextAllocation: allocation,
            reason: "Created from reviewed document import.",
            managerId: user.id,
          });
        }
        if (imp.fileId) {
          await tx.insert(fileAttachments).values({
            fileId: imp.fileId,
            targetType: "agreement_group",
            targetId: group.id,
            label: "source_agreement",
          });
        }
      }
      await insertAgreementPayments(
        tx,
        ownerProjectId,
        data,
        ownerProject.currency?.trim() || "USD",
        user.id,
        coveredProjects,
        sharedMouGroupId
      );
    }

    await tx
      .update(documentImports)
      .set({
        status: "committed",
        committedProjectIds: committedIds,
        reviewed: data,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documentImports.id, importId));
  });

  if (createdSharedMouGroupId) {
    await reevaluateSharedMouPayments({
      groupId: createdSharedMouGroupId,
      actorId: user.id,
    });
  }

  // Deferred work that can't run inside the transaction.
  for (const projectId of committedIds) {
    // Wire quarterly/artwork obligations to their recurring rule / gate task.
    await generateObligationTasksForProject(projectId, user.id);
    await recomputeProjectBlockers(projectId);
    await syncBudgetApprovalState(projectId);
    await logActivity({
      actorId: user.id,
      projectId,
      entityType: "project",
      action: "import",
      summary: `Imported from document`,
    });
  }
  if (imp.fileId) {
    after(() =>
      enqueueAndProcessAgreementDocumentsForFile(imp.fileId!).catch((error) =>
        console.error("Immediate agreement indexing failed; cron will retry:", error)
      )
    );
  }

  // Same-book batch: if another uncommitted document looks like one of the
  // projects we just committed, jump straight to its review so the user can
  // layer it on (it will now match and default to "Update existing") instead of
  // being stranded back on the projects list.
  const committedTitles = new Set(
    valid.map((d) => norm(data.projects[d.index].title))
  );
  const siblings = await db
    .select({
      id: documentImports.id,
      extraction: documentImports.extraction,
      reviewed: documentImports.reviewed,
    })
    .from(documentImports)
    .where(
      and(
        eq(documentImports.status, "extracted"),
        isNull(documentImports.targetProjectId)
      )
    )
    .orderBy(asc(documentImports.createdAt));
  const next = siblings.find((s) => {
    const t = (s.reviewed ?? s.extraction)?.projects?.[0]?.title;
    return t ? committedTitles.has(norm(t)) : false;
  });

  revalidatePath("/projects");
  revalidatePath("/projects/import");
  redirect(next ? `/projects/import/${next.id}` : "/projects");
}

/**
 * Attach a grant/MoU to EXISTING projects instead of creating a new one. Used
 * when a signed umbrella MoU (one project, one total) arrives for projects a
 * grant application already created (one per budget line-item): the agreement's
 * rights, partner, obligations, and payment schedule are layered onto each
 * selected project as a shared MoU — no duplicate project is minted, and each
 * project keeps its own budget.
 */
export async function attachAgreementToProjects(
  importId: string,
  projectIds: string[]
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [imp] = await db
    .select()
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp) return { error: "Import not found." };
  if (imp.status === "committed" || (imp.committedProjectIds?.length ?? 0) > 0) {
    redirect("/projects");
  }
  if (imp.fundingSourceKey) return { error: "Approve email funding from its MoU funding review." };
  const rawData = imp.reviewed ?? imp.extraction;
  if (!rawData) return { error: "Nothing to attach — parse the document first." };
  const data = gateExtractionFormats(normalizeExtraction(rawData));
  if (data.documentKind === "invoice") {
    return { error: "An invoice can't be attached as an agreement." };
  }
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (ids.length === 0) {
    return { error: "Select at least one existing project to attach to." };
  }

  // Load the targets + their current budget totals (used as shared-MoU shares).
  const targetRows = await db
    .select({
      id: projects.id,
      title: projects.title,
      slug: projects.slug,
      dueDate: projects.dueDate,
      totalCents: sql<number>`coalesce(round(sum(coalesce(${budgetItems.amount}, 0)) * 100), 0)::int`,
    })
    .from(projects)
    .leftJoin(budgetItems, eq(budgetItems.projectId, projects.id))
    .where(inArray(projects.id, ids))
    .groupBy(projects.id, projects.title, projects.slug, projects.dueDate);
  if (targetRows.length === 0) {
    return { error: "No matching projects found to attach to." };
  }

  // The agreement's umbrella project carries the rights/obligations to layer on.
  const source = data.projects[0] ?? null;
  const currency = source?.currency?.trim().toUpperCase() || "USD";
  const owner = targetRows[0];
  const coveredProjects = targetRows.map((t) => ({
    id: t.id,
    title: t.title,
    publicationDate: t.dueDate ? String(t.dueDate) : null,
  }));
  const makeGroup =
    targetRows.length > 1 &&
    (data.mouPaymentSchedule.length > 0 || (data.agreementTotalAmount ?? 0) > 0);
  let createdSharedMouGroupId: string | null = null;

  await db.transaction(async (tx) => {
    const holderId = await resolveHolder(tx, data);
    const partnerLink = await resolvePartner(tx, data);

    // Layer the agreement (rights, partner, obligations) onto each project —
    // never its budget, description, or dates (each project keeps its own).
    if (source) {
      for (const target of targetRows) {
        await mergeProjectFromExtraction(tx, {
          projectId: target.id,
          proj: source,
          data,
          holderId,
          partnerLink,
          fileId: imp.fileId,
          userId: user.id,
          applyDescription: false,
          applyDates: false,
          budgetMode: "skip",
          applyRights: true,
        });

        // Layer the agreement's standing obligations (e.g. the grant's progress
        // report) onto the project — mergeProjectFromExtraction advances rights
        // but not obligations. Skip ones already present so re-attaching a
        // superseding document doesn't duplicate them. generateObligationTasks…
        // (below, deferred) turns report cadences into recurring reminders.
        if (source.obligations.length > 0) {
          const [rItem] = await tx
            .select({ id: rightsItems.id })
            .from(rightsItems)
            .where(eq(rightsItems.projectId, target.id))
            .limit(1);
          const existing = await tx
            .select({ text: licenseObligations.text })
            .from(licenseObligations)
            .where(eq(licenseObligations.projectId, target.id));
          const seen = new Set(existing.map((o) => o.text.trim()));
          const fresh = source.obligations.filter(
            (o) => !seen.has(o.text.trim())
          );
          if (fresh.length > 0) {
            await tx.insert(licenseObligations).values(
              fresh.map((o) => ({
                projectId: target.id,
                rightsItemId: rItem?.id ?? null,
                clauseRef: o.clauseRef,
                kind: o.kind,
                cadence: o.cadence,
                firstDueDate: o.firstDueDate,
                label: o.label,
                text: o.text,
                createdBy: user.id,
              }))
            );
          }
        }
      }
    }

    let sharedMouGroupId: string | null = null;
    if (makeGroup) {
      const year = data.signedDate?.slice(0, 4);
      const fallbackName = [
        year ? `FY${year.slice(2)}` : null,
        data.partnerOrg,
        "MoU",
      ]
        .filter(Boolean)
        .join(" ");
      const [group] = await tx
        .insert(sharedMouGroups)
        .values({
          name: data.documentTitle?.trim() || fallbackName || "Shared MoU",
          counterparty: data.partnerOrg?.trim() || null,
          contactName: data.contactName?.trim() || null,
          contactEmail: data.contactEmail?.trim() || null,
          contactPhone: data.contactPhone?.trim() || null,
          signedDate: isoDate(data.signedDate),
          currency,
          agreementTotal: (data.agreementTotalAmount ?? 0).toFixed(2),
          sourceImportId: importId,
          administrativeProjectId: owner.id,
          createdBy: user.id,
        })
        .returning({ id: sharedMouGroups.id });
      sharedMouGroupId = group.id;
      createdSharedMouGroupId = group.id;
      for (const target of targetRows) {
        // Each project's existing budget total is its share of the grant.
        const allocation = (Number(target.totalCents) / 100).toFixed(2);
        const [membership] = await tx
          .insert(sharedMouMemberships)
          .values({
            groupId: group.id,
            projectId: target.id,
            allocationAmount: allocation,
            addedBy: user.id,
            addedReason: "Attached an existing project to an imported MoU.",
          })
          .returning({ id: sharedMouMemberships.id });
        await tx.insert(sharedMouMembershipAudits).values({
          groupId: group.id,
          membershipId: membership.id,
          projectId: target.id,
          action: "added",
          previousAllocation: null,
          nextAllocation: allocation,
          reason: "Attached an existing project to an imported MoU.",
          managerId: user.id,
        });
      }
      if (imp.fileId) {
        await tx.insert(fileAttachments).values({
          fileId: imp.fileId,
          targetType: "agreement_group",
          targetId: group.id,
          label: "source_agreement",
        });
      }
    }

    await insertAgreementPayments(
      tx,
      owner.id,
      data,
      currency,
      user.id,
      coveredProjects,
      sharedMouGroupId
    );

    await tx
      .update(documentImports)
      .set({
        status: "committed",
        committedProjectIds: ids,
        reviewed: data,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documentImports.id, importId));
  });

  if (createdSharedMouGroupId) {
    await reevaluateSharedMouPayments({
      groupId: createdSharedMouGroupId,
      actorId: user.id,
    });
  }

  for (const projectId of ids) {
    await generateObligationTasksForProject(projectId, user.id);
    await recomputeProjectBlockers(projectId);
    await syncBudgetApprovalState(projectId);
    await logActivity({
      actorId: user.id,
      projectId,
      entityType: "project",
      action: "import",
      summary: "Attached an imported MoU",
    });
  }
  if (imp.fileId) {
    after(() =>
      enqueueAndProcessAgreementDocumentsForFile(imp.fileId!).catch((error) =>
        console.error("Immediate agreement indexing failed; cron will retry:", error)
      )
    );
  }

  revalidatePath("/projects");
  revalidatePath("/projects/import");
  redirect(`/projects/${owner.slug}/budget`);
}

// ── Update mode: apply a document to an existing project ─────────────────────

/**
 * Create one update-mode import per uploaded file, all targeting the same
 * project, and kick off extraction for each. Returns them in creation order so
 * the caller can open the first; the review screen chains to the rest as each is
 * applied. One document is just the single-element case.
 */
export async function createImportsForProject(
  fileIds: string[],
  projectId: string
): Promise<{ importIds?: string[]; firstImportId?: string; error?: string }> {
  const { user } = await requireRole("manager");
  const requested = fileIds.filter(Boolean);
  if (requested.length === 0) return { error: "No files to import." };

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "Project not found." };

  // Keep the caller's order, but drop any id whose upload didn't persist.
  const known = new Set(
    (
      await db
        .select({ id: files.id })
        .from(files)
        .where(inArray(files.id, requested))
    ).map((f) => f.id)
  );
  const valid = requested.filter((id) => known.has(id));
  if (valid.length === 0) return { error: "Files not found." };

  const inserted = await db
    .insert(documentImports)
    .values(
      valid.map((fileId) => ({
        fileId,
        targetProjectId: projectId,
        status: "parsing" as const,
        createdBy: user.id,
      }))
    )
    .returning({ id: documentImports.id });

  for (const imp of inserted) after(() => runExtraction(imp.id));
  revalidatePath("/projects/import");
  return {
    importIds: inserted.map((imp) => imp.id),
    firstImportId: inserted[0]?.id,
  };
}

/**
 * After an update-mode import commits, walk to the next document still queued
 * for the same project (multi-document update), or fall back to the project.
 */
async function nextUpdateImportPath(
  projectId: string,
  projectSlug: string,
  currentImportId: string
): Promise<string> {
  const [next] = await db
    .select({ id: documentImports.id })
    .from(documentImports)
    .where(
      and(
        eq(documentImports.targetProjectId, projectId),
        ne(documentImports.id, currentImportId),
        notInArray(documentImports.status, ["committed", "discarded"])
      )
    )
    .orderBy(asc(documentImports.createdAt), asc(documentImports.id))
    .limit(1);
  return next ? `/projects/import/${next.id}` : `/projects/${projectSlug}`;
}

const importedInvoiceSchema = z.object({
  paymentId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(120),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  recipientName: z.string().trim().max(240).nullable(),
  recipientEmail: z.string().trim().email().max(320).nullable(),
  amount: z.coerce.number().positive().finite(),
  currency: z.string().trim().min(3).max(8),
  description: z.string().trim().min(1).max(2000),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Save a reviewed historical outgoing invoice and record its receipt together.
 * This is deliberately one transaction: the project can never show an invoice
 * without the corresponding received funding (or vice versa).
 */
export async function applyImportedInvoice(
  importId: string,
  input: z.input<typeof importedInvoiceSchema>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = importedInvoiceSchema.safeParse(input);
  if (!parsed.success) return { error: "Review the invoice fields before saving." };
  const value = parsed.data;

  const [imp] = await db
    .select()
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp?.targetProjectId || !imp.fileId) {
    return { error: "This invoice import is not attached to a project and file." };
  }
  if (imp.status === "committed" || (imp.committedProjectIds?.length ?? 0) > 0) {
    const [project] = await db
      .select({ slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, imp.targetProjectId))
      .limit(1);
    if (project) redirect(`/projects/${project.slug}/budget`);
    return { error: "This invoice was already saved." };
  }

  const data = normalizeExtraction(imp.reviewed ?? imp.extraction);
  if (data.documentKind !== "invoice" || !data.invoice) {
    return { error: "The AI did not identify this document as an invoice." };
  }
  if (data.invoice.direction !== "outgoing") {
    return {
      error:
        "Confirm that this is an outgoing invoice issued by your organization before recording receipt.",
    };
  }

  const [payment, project, duplicate, existingInvoice] = await Promise.all([
    db
      .select()
      .from(mouPayments)
      .where(eq(mouPayments.id, value.paymentId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: projects.id, slug: projects.slug, title: projects.title })
      .from(projects)
      .where(eq(projects.id, imp.targetProjectId!))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: invoices.id, mouPaymentId: invoices.mouPaymentId })
      .from(invoices)
      .where(eq(invoices.invoiceNumber, value.invoiceNumber))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.mouPaymentId, value.paymentId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!payment || payment.projectId !== imp.targetProjectId) {
    return { error: "Choose a scheduled payment from this project." };
  }
  if (payment.sharedMouGroupId) {
    return { error: "Shared-agreement receipts must be recorded on the agreement." };
  }
  if (!project) return { error: "Project not found." };
  if (duplicate && duplicate.id !== existingInvoice?.id) {
    return { error: `Invoice ${value.invoiceNumber} is already recorded.` };
  }
  if (existingInvoice) {
    return {
      error:
        existingInvoice.status === "void"
          ? "This payment already has a void invoice in its history. Generate a replacement instead."
          : "This payment already has an immutable invoice. Void it before creating a replacement.",
    };
  }

  const [workspace, budgetSettings, presentation] = await Promise.all([
    getWorkspaceSettings(),
    getOrCreateBudgetSettings(project.id),
    getBudgetPresentation(project.id, payment.printRunId ?? undefined),
  ]);
  const amount = value.amount.toFixed(2);
  const currency = value.currency.toUpperCase();
  const paidAt = new Date(`${value.receivedDate}T12:00:00.000Z`);
  let invoiceId: string | null = null;

  await db.transaction(async (tx) => {
    let receiptId = payment.receiptId;
    const receiptValues = {
      amount,
      deductionBps: presentation?.deductionBps ?? 0,
      expectedNetAmount: (
        expectedNetCents(
          Math.round(value.amount * 100),
          presentation?.deductionBps ?? 0
        ) / 100
      ).toFixed(2),
      actualNetAmount: null,
      currency,
      receivedDate: value.receivedDate,
      source: value.recipientName || budgetSettings.partnerName || "Invoice payer",
      note: `Invoice ${value.invoiceNumber}: ${value.description}`,
    };
    if (receiptId) {
      await tx
        .update(fundingReceipts)
        .set(receiptValues)
        .where(eq(fundingReceipts.id, receiptId));
    } else {
      const [receipt] = await tx
        .insert(fundingReceipts)
        .values({
          projectId: project.id,
          printRunId: payment.printRunId,
          ...receiptValues,
          recordedBy: user.id,
        })
        .returning({ id: fundingReceipts.id });
      receiptId = receipt.id;
    }

    const invoiceValues = {
      projectId: project.id,
      printRunId: payment.printRunId,
      mouPaymentId: payment.id,
      invoiceNumber: value.invoiceNumber,
      recipientName: value.recipientName,
      recipientEmail: value.recipientEmail,
      amount,
      currency,
      issueDate: value.issueDate,
      dueDate: value.dueDate,
      description: value.description,
      notes: payment.notes,
      sourceFileId: imp.fileId,
      issuerSnapshot: getInvoiceIssuerSnapshot(workspace),
      createdBy: user.id,
    };
    const [created] = await tx
      .insert(invoices)
      .values(invoiceValues)
      .returning({ id: invoices.id });
    invoiceId = created.id;

    await tx
      .update(mouPayments)
      .set({
        amount,
        currency,
        dueDate: value.dueDate ?? payment.dueDate,
        paidAt,
        receiptId,
      })
      .where(eq(mouPayments.id, payment.id));
    await tx
      .update(documentImports)
      .set({
        status: "committed",
        committedProjectIds: [project.id],
        reviewed: data,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documentImports.id, importId));
  });

  await recomputeProjectBlockers(project.id);
  await syncBudgetApprovalState(project.id);
  await logActivity({
    actorId: user.id,
    projectId: project.id,
    entityType: "budget",
    entityId: invoiceId,
    action: "invoice_received",
    summary: `Recorded paid invoice ${value.invoiceNumber}`,
  });
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath(`/projects/${project.slug}/budget`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect(await nextUpdateImportPath(project.id, project.slug, importId));
}

/**
 * Merge a reviewed import into its target project. Budget = replace (when the
 * document has lines); rights = advance-don't-clear; details = optional. Idempotent.
 */
export async function applyImportToProject(
  importId: string,
  opts: {
    projectIndex: number;
    applyDescription: boolean;
    applyDates: boolean;
    budgetMode: BudgetMode;
    applyRights: boolean;
  }
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [imp] = await db
    .select()
    .from(documentImports)
    .where(eq(documentImports.id, importId))
    .limit(1);
  if (!imp) return { error: "Import not found." };
  if (!imp.targetProjectId)
    return { error: "This import is not attached to a project." };

  const projectId = imp.targetProjectId;
  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "Project not found." };

  // Idempotency: never apply twice. If this was one of several documents queued
  // for the project, carry on to the next still-pending one.
  if (imp.status === "committed" || (imp.committedProjectIds?.length ?? 0) > 0) {
    redirect(await nextUpdateImportPath(projectId, project.slug, importId));
  }

  if (imp.fundingSourceKey) return { error: "Approve email funding from its MoU funding review." };
  const rawData = imp.reviewed ?? imp.extraction;
  if (!rawData) return { error: "Nothing to apply — parse the document first." };
  const data = gateExtractionFormats(normalizeExtraction(rawData));
  const proj = data.projects[opts.projectIndex];
  if (!proj) return { error: "Select which work in the document to apply." };

  await db.transaction(async (tx) => {
    const holderId = await resolveHolder(tx, data);
    const partnerLink = await resolvePartner(tx, data);
    await mergeProjectFromExtraction(tx, {
      projectId,
      proj,
      data,
      holderId,
      partnerLink,
      fileId: imp.fileId,
      userId: user.id,
      applyDescription: opts.applyDescription,
      applyDates: opts.applyDates,
      budgetMode: opts.budgetMode,
      applyRights: opts.applyRights,
    });
    await materializePodcastEpisodesFromImport(
      tx,
      projectId,
      proj,
      user.id
    );
    await insertAgreementPayments(
      tx,
      projectId,
      data,
      proj.currency?.trim() || "USD",
      user.id,
      [
        {
          id: projectId,
          title: project.title,
          publicationDate: proj.publicationDate,
        },
      ]
    );
    await tx
      .update(documentImports)
      .set({
        status: "committed",
        committedProjectIds: [projectId],
        reviewed: data,
        committedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documentImports.id, importId));
  });

  await recomputeProjectBlockers(projectId);
  await syncBudgetApprovalState(projectId);
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    action: "import_update",
    summary: `Updated from document import`,
  });
  if (imp.fileId) {
    after(() =>
      enqueueAndProcessAgreementDocumentsForFile(imp.fileId!).catch((error) =>
        console.error("Immediate agreement indexing failed; cron will retry:", error)
      )
    );
  }
  revalidatePath("/projects");
  revalidatePath("/projects/import");
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath(`/projects/${project.slug}/budget`);
  revalidatePath(`/projects/${project.slug}/rights`);
  // Multi-document update: hand off to the next queued document, else the project.
  redirect(await nextUpdateImportPath(projectId, project.slug, importId));
}
