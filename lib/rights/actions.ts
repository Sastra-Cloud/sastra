"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { db } from "@/lib/db";
import {
  licenseFeePayments,
  emailThreads,
  phases,
  projects,
  rightsContacts,
  rightsHolders,
  rightsItems,
  tasks,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications";
import { assignTask } from "@/lib/tasks/actions";
import { logActivity } from "@/lib/activity/log";
import { formatDate } from "@/lib/format";
import { ensureLicenseFeePaymentsForProject } from "./license-fee-recurring";
import { deriveOverall } from "./derive";
import { findHolderMatch } from "./holder-match";

async function revalidate(projectId: string) {
  await recomputeProjectBlockers(projectId);
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) {
    revalidatePath(`/projects/${p.slug}/rights`);
    // The license-fee ledger is mirrored on Budget, and rights changes can spawn
    // reminder tasks — refresh those surfaces too.
    revalidatePath(`/projects/${p.slug}/budget`);
    revalidatePath(`/projects/${p.slug}/tasks`);
    revalidatePath(`/projects/${p.slug}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
  }
}

const stepEnum = z.enum(["not_needed", "not_started", "in_progress", "signed"]);
const updateSchema = z.object({
  agreementType: z.enum(["mou_only", "mou_plus_license", "license_only"]),
  mouStatus: stepEnum,
  mouCommercial: z.boolean(),
  mouSignedDate: z.string().optional(),
  mouExpiresDate: z.string().optional(),
  mouHolderId: z.string().uuid().nullable().optional(),
  mouContactId: z.string().uuid().nullable().optional(),
  mouAssignedTo: z.string().nullable().optional(),
  licenseStatus: stepEnum,
  licenseSignedDate: z.string().optional(),
  licenseExpiresDate: z.string().optional(),
  licenseHolderId: z.string().uuid().nullable().optional(),
  licenseContactId: z.string().uuid().nullable().optional(),
  licenseAssignedTo: z.string().nullable().optional(),
  licenseTermMonths: z.coerce.number().int().min(0).max(1200).nullable().optional(),
  licenseAutoRenews: z.boolean().optional(),
  licenseRenewalMonths: z.coerce.number().int().min(0).max(120).nullable().optional(),
  licenseRenewalNoticeDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  licenseRenewalLeadDays: z.coerce.number().int().min(0).max(365).optional(),
  licenseRenewalAssignedTo: z.string().nullable().optional(),
  licenseFeeAmount: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  licenseFeeCurrency: z.string().max(8).nullable().optional(),
  licenseFeeDueDate: z.string().optional(),
  licenseFeeRecurs: z.boolean().optional(),
  licenseFeeAssignedTo: z.string().nullable().optional(),
  copyrightHolderId: z.string().uuid().nullable().optional(),
  copyrightNotice: z.string().optional(),
  territory: z.string().nullable().optional(),
  commercialGranted: z.boolean(),
  formatPrint: z.boolean(),
  formatEbook: z.boolean(),
  formatAudio: z.boolean(),
  formatVideo: z.boolean(),
  rightsStartDate: z.string().optional(),
  completeByDate: z.string().optional(),
  maxCopies: z.coerce.number().int().min(0).nullable().optional(),
  notes: z.string().optional(),
});

export type RightsState = { error?: string; ok?: boolean };

const nz = (v: string | null | undefined) => (v && v !== "none" ? v : null);

/** Add `months` to a YYYY-MM-DD date (day clamped to month length). */
function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export async function updateRights(
  projectId: string,
  input: z.infer<typeof updateSchema>
): Promise<RightsState> {
  const { user } = await requireRole("manager");
  const d = updateSchema.parse(input);

  // Snapshot the current assignees + task ids so we can tell a first assignment
  // (materialize a task) from a reassignment (move the existing task).
  const [existing] = await db
    .select({
      mouAssignedTo: rightsItems.mouAssignedTo,
      mouTaskId: rightsItems.mouTaskId,
      licenseAssignedTo: rightsItems.licenseAssignedTo,
      licenseTaskId: rightsItems.licenseTaskId,
    })
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);

  const newMouAssignee = nz(d.mouAssignedTo);
  const newLicenseAssignee = nz(d.licenseAssignedTo);

  // Assigning a chaser to a live, not-yet-initiated step materializes its task.
  const willCreateMou =
    stepApplies(d.agreementType, "mou") &&
    d.mouStatus !== "signed" &&
    d.mouStatus !== "not_needed" &&
    !!newMouAssignee &&
    !existing?.mouTaskId;
  const willCreateLicense =
    stepApplies(d.agreementType, "license") &&
    d.licenseStatus !== "signed" &&
    d.licenseStatus !== "not_needed" &&
    !!newLicenseAssignee &&
    !existing?.licenseTaskId;

  // A materialized step is in progress; derive overall from the effective values.
  const effMouStatus = willCreateMou ? "in_progress" : d.mouStatus;
  const effLicenseStatus = willCreateLicense ? "in_progress" : d.licenseStatus;
  const overallStatus = deriveOverall(
    d.agreementType,
    effMouStatus,
    effLicenseStatus
  );

  // Expiry = explicit value, else derived from term + a start (signed/effective date).
  const termStart = d.licenseSignedDate || d.rightsStartDate || null;
  const licenseExpiresDate =
    d.licenseExpiresDate ||
    (d.licenseTermMonths && termStart
      ? addMonthsYmd(termStart, d.licenseTermMonths)
      : null);

  await db
    .update(rightsItems)
    .set({
      agreementType: d.agreementType,
      mouStatus: effMouStatus,
      mouCommercial: d.mouCommercial,
      mouSignedDate: d.mouSignedDate || null,
      mouExpiresDate: d.mouExpiresDate || null,
      mouHolderId: nz(d.mouHolderId),
      mouContactId: nz(d.mouContactId),
      mouAssignedTo: nz(d.mouAssignedTo),
      licenseStatus: effLicenseStatus,
      licenseSignedDate: d.licenseSignedDate || null,
      licenseExpiresDate,
      licenseHolderId: nz(d.licenseHolderId),
      licenseContactId: nz(d.licenseContactId),
      licenseAssignedTo: nz(d.licenseAssignedTo),
      licenseTermMonths: d.licenseTermMonths ?? null,
      licenseAutoRenews: d.licenseAutoRenews ?? false,
      licenseRenewalMonths: d.licenseRenewalMonths ?? null,
      licenseRenewalNoticeDays: d.licenseRenewalNoticeDays ?? null,
      licenseRenewalLeadDays: d.licenseRenewalLeadDays ?? 30,
      licenseRenewalAssignedTo: nz(d.licenseRenewalAssignedTo),
      licenseFeeAmount:
        d.licenseFeeAmount != null && d.licenseFeeAmount > 0
          ? d.licenseFeeAmount.toFixed(2)
          : null,
      licenseFeeCurrency: d.licenseFeeCurrency?.trim() || null,
      licenseFeeDueDate: d.licenseFeeDueDate || null,
      licenseFeeRecurs: d.licenseFeeRecurs ?? false,
      licenseFeeAssignedTo: nz(d.licenseFeeAssignedTo),
      copyrightHolderId: nz(d.copyrightHolderId),
      copyrightNotice: d.copyrightNotice || null,
      // Preserve territory when a caller omits it (undefined → column untouched).
      territory: d.territory === undefined ? undefined : d.territory || null,
      commercialGranted: d.commercialGranted,
      formatPrint: d.formatPrint,
      formatEbook: d.formatEbook,
      formatAudio: d.formatAudio,
      formatVideo: d.formatVideo,
      rightsStartDate: d.rightsStartDate || null,
      completeByDate: d.completeByDate || null,
      maxCopies: d.maxCopies ?? null,
      notes: d.notes || null,
      overallStatus,
      updatedAt: new Date(),
    })
    .where(eq(rightsItems.projectId, projectId));

  // Schedule the license-fee payable + its reminder task (owner defaults to the
  // project creator) as soon as a fee is set.
  await ensureLicenseFeePaymentsForProject(projectId, user.id);

  // Make rights ownership visible: assigning a chaser creates a real task (so it
  // lands in their My Tasks + notifications); changing the chaser moves it;
  // clearing it unassigns the task.
  const steps = [
    {
      step: "mou" as const,
      willCreate: willCreateMou,
      newAssignee: newMouAssignee,
      oldAssignee: existing?.mouAssignedTo ?? null,
      taskId: existing?.mouTaskId ?? null,
    },
    {
      step: "license" as const,
      willCreate: willCreateLicense,
      newAssignee: newLicenseAssignee,
      oldAssignee: existing?.licenseAssignedTo ?? null,
      taskId: existing?.licenseTaskId ?? null,
    },
  ];
  for (const s of steps) {
    if (s.willCreate) {
      await ensureRightsStepTask(projectId, s.step, user.id);
    } else if (s.taskId && s.newAssignee && s.newAssignee !== s.oldAssignee) {
      await assignTask(s.taskId, s.newAssignee); // reassign existing task (notifies)
    } else if (s.taskId && !s.newAssignee && s.oldAssignee) {
      await assignTask(s.taskId, null); // chaser cleared → unassign, keep the task
    }
  }

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "rights",
    action: "update",
    summary: `Updated rights (${overallStatus.replace("_", " ")})`,
  });
  await revalidate(projectId);
  return { ok: true };
}

/** Mark a license-fee payment as paid (managers only). */
export async function markLicenseFeePaid(id: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [row] = await db
    .update(licenseFeePayments)
    .set({ paidAt: new Date(), paidBy: user.id })
    .where(eq(licenseFeePayments.id, id))
    .returning({ projectId: licenseFeePayments.projectId });
  if (row) await revalidate(row.projectId);
  return {};
}

/** Undo a license-fee paid mark (managers only). */
export async function markLicenseFeeUnpaid(id: string): Promise<{ error?: string }> {
  await requireRole("manager");
  const [row] = await db
    .update(licenseFeePayments)
    .set({ paidAt: null, paidBy: null })
    .where(eq(licenseFeePayments.id, id))
    .returning({ projectId: licenseFeePayments.projectId });
  if (row) await revalidate(row.projectId);
  return {};
}

/** Does a step exist for this agreement type? */
function stepApplies(
  agreementType: "mou_only" | "mou_plus_license" | "license_only",
  step: "mou" | "license"
): boolean {
  return step === "mou"
    ? agreementType === "mou_only" || agreementType === "mou_plus_license"
    : agreementType === "mou_plus_license" || agreementType === "license_only";
}

/**
 * Create the "obtain rights" task for a step and notify its assignee — idempotent
 * (guarded by the stored mou/license task id, so it never double-creates). Flips
 * the step to in_progress. Callers own auth + revalidation. Returns the task id.
 */
async function ensureRightsStepTask(
  projectId: string,
  step: "mou" | "license",
  actorId: string
): Promise<string | null> {
  const [r] = await db
    .select()
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  if (!r) return null;
  const existingTaskId = step === "mou" ? r.mouTaskId : r.licenseTaskId;
  if (existingTaskId) return existingTaskId; // already initiated

  const holderId = step === "mou" ? r.mouHolderId : r.licenseHolderId;
  const assignee = step === "mou" ? r.mouAssignedTo : r.licenseAssignedTo;
  let holderName = "the rights holder";
  if (holderId) {
    const [h] = await db
      .select({ name: rightsHolders.name })
      .from(rightsHolders)
      .where(eq(rightsHolders.id, holderId))
      .limit(1);
    if (h) holderName = h.name;
  }

  // Resolve the project's Rights phase (name-based, with fallback to none).
  const [rightsPhase] = await db
    .select({ id: phases.id })
    .from(phases)
    .where(and(eq(phases.projectId, projectId), ilike(phases.name, "%rights%")))
    .limit(1);

  const title =
    step === "license"
      ? `Obtain commercial license from ${holderName}`
      : `Obtain MoU from ${holderName}`;

  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      phaseId: rightsPhase?.id ?? null,
      title,
      status: "todo",
      priority: "high",
      assignedTo: assignee ?? null,
      dueDate: r.completeByDate ?? null,
      createdBy: actorId,
    })
    .returning({ id: tasks.id });

  await db
    .update(rightsItems)
    .set(
      step === "mou"
        ? { mouTaskId: task.id, mouStatus: "in_progress", updatedAt: new Date() }
        : {
            licenseTaskId: task.id,
            licenseStatus: "in_progress",
            updatedAt: new Date(),
          }
    )
    .where(eq(rightsItems.projectId, projectId));

  if (assignee && assignee !== actorId) {
    const [p] = await db
      .select({ slug: projects.slug, title: projects.title })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    await notify({
      userId: assignee,
      type: "task_assigned",
      title: `Task assigned to you: ${title}`,
      body: r.completeByDate ? `Due ${formatDate(r.completeByDate)}` : undefined,
      project: p?.title,
      link: p ? `/projects/${p.slug}/tasks` : "/dashboard",
      data: { taskId: task.id },
    });
  }

  await logActivity({
    actorId,
    projectId,
    entityType: "rights",
    entityId: task.id,
    action: "initiate",
    summary: `Initiated ${step === "license" ? "license" : "MoU"} request: ${title}`,
  });
  return task.id;
}

/** Create a task to obtain a rights step; idempotent (won't duplicate). */
export async function initiateRightsStep(
  projectId: string,
  step: "mou" | "license"
) {
  const { user } = await requireRole("manager");
  await ensureRightsStepTask(projectId, step, user.id);
  await revalidate(projectId);
}

const holderSchema = z.object({
  name: z.string().trim().min(1).max(200),
  website: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function revalidateHolderDirectory() {
  revalidatePath("/settings/publishers");
  revalidatePath("/projects");
  revalidatePath("/correspondence");
}

export async function createHolder(name: string, website?: string) {
  await requireRole("manager");
  const data = holderSchema.parse({ name, website });
  const holders = await db
    .select({ id: rightsHolders.id, name: rightsHolders.name })
    .from(rightsHolders);
  const existing = findHolderMatch(data.name, holders);
  if (existing) {
    return { id: existing.id, name: existing.name, existing: true };
  }
  const [h] = await db
    .insert(rightsHolders)
    .values({ name: data.name, website: data.website || null })
    .returning({ id: rightsHolders.id, name: rightsHolders.name });
  revalidateHolderDirectory();
  return { id: h.id, name: h.name, existing: false };
}

export async function updateHolder(
  id: string,
  input: z.input<typeof holderSchema>
) {
  await requireRole("manager");
  const data = holderSchema.parse(input);
  const holders = await db
    .select({ id: rightsHolders.id, name: rightsHolders.name })
    .from(rightsHolders);
  const duplicate = findHolderMatch(
    data.name,
    holders.filter((holder) => holder.id !== id)
  );
  if (duplicate) {
    throw new Error(
      `“${data.name}” matches “${duplicate.name}”. Merge these publishers instead of renaming this one.`
    );
  }
  await db
    .update(rightsHolders)
    .set({
      name: data.name,
      website: data.website || null,
      notes: data.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(rightsHolders.id, id));
  revalidateHolderDirectory();
  return {};
}

export async function createContact(
  holderId: string,
  name: string,
  email?: string,
  role?: string,
  phone?: string
) {
  await requireRole("manager");
  const clean = name.trim();
  if (!holderId || !clean) return null;
  const existingContacts = await db
    .select({
      id: rightsContacts.id,
      name: rightsContacts.name,
      email: rightsContacts.email,
    })
    .from(rightsContacts)
    .where(eq(rightsContacts.holderId, holderId));
  const cleanEmail = email?.trim().toLowerCase() || null;
  const duplicate = existingContacts.find(
    (contact) =>
      (cleanEmail && contact.email?.trim().toLowerCase() === cleanEmail) ||
      contact.name.trim().toLowerCase() === clean.toLowerCase()
  );
  if (duplicate) return duplicate.id;
  const [c] = await db
    .insert(rightsContacts)
    .values({
      holderId,
      name: clean,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      role: role?.trim() || null,
    })
    .returning({ id: rightsContacts.id });
  revalidateHolderDirectory();
  return c.id;
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320).optional(),
  phone: z.string().trim().max(60).optional(),
  role: z.string().trim().max(120).optional(),
});

export async function updateContact(
  id: string,
  input: z.input<typeof contactSchema>
) {
  await requireRole("manager");
  const data = contactSchema.parse(input);
  await db
    .update(rightsContacts)
    .set({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      role: data.role || null,
    })
    .where(eq(rightsContacts.id, id));
  revalidateHolderDirectory();
  return {};
}

async function contactUsage(contactId: string) {
  const [projectsUsing, threadsUsing] = await Promise.all([
    db
      .select({ projectId: rightsItems.projectId })
      .from(rightsItems)
      .where(
        or(
          eq(rightsItems.mouContactId, contactId),
          eq(rightsItems.licenseContactId, contactId)
        )
      ),
    db
      .select({ id: emailThreads.id })
      .from(emailThreads)
      .where(eq(emailThreads.contactId, contactId)),
  ]);
  return {
    projectCount: new Set(projectsUsing.map((row) => row.projectId)).size,
    threadCount: threadsUsing.length,
  };
}

export async function deleteContact(id: string) {
  await requireRole("manager");
  const usage = await contactUsage(id);
  if (usage.projectCount > 0 || usage.threadCount > 0) {
    throw new Error(
      `This contact is linked to ${usage.projectCount} project${usage.projectCount === 1 ? "" : "s"} and ${usage.threadCount} correspondence thread${usage.threadCount === 1 ? "" : "s"}. Reassign those links before deleting it.`
    );
  }
  await db.delete(rightsContacts).where(eq(rightsContacts.id, id));
  revalidateHolderDirectory();
  return {};
}

export async function deleteHolder(id: string) {
  await requireRole("manager");
  const [[holder], contacts] = await Promise.all([
    db
      .select({ name: rightsHolders.name })
      .from(rightsHolders)
      .where(eq(rightsHolders.id, id))
      .limit(1),
    db
      .select({ id: rightsContacts.id })
      .from(rightsContacts)
      .where(eq(rightsContacts.holderId, id)),
  ]);
  const contactIds = contacts.map((contact) => contact.id);
  const [projectLinks, holderThreads, contactProjectLinks, contactThreads] =
    await Promise.all([
      db
        .select({ projectId: rightsItems.projectId })
        .from(rightsItems)
        .where(
          or(
            eq(rightsItems.mouHolderId, id),
            eq(rightsItems.licenseHolderId, id),
            eq(rightsItems.copyrightHolderId, id)
          )
        ),
      db
        .select({ id: emailThreads.id })
        .from(emailThreads)
        .where(eq(emailThreads.holderId, id)),
      contactIds.length > 0
        ? db
            .select({ projectId: rightsItems.projectId })
            .from(rightsItems)
            .where(
              or(
                inArray(rightsItems.mouContactId, contactIds),
                inArray(rightsItems.licenseContactId, contactIds)
              )
            )
        : Promise.resolve([]),
      contactIds.length > 0
        ? db
            .select({ id: emailThreads.id })
            .from(emailThreads)
            .where(inArray(emailThreads.contactId, contactIds))
        : Promise.resolve([]),
    ]);
  const projectCount = new Set(
    [...projectLinks, ...contactProjectLinks].map((row) => row.projectId)
  ).size;
  const threadCount = new Set(
    [...holderThreads, ...contactThreads].map((row) => row.id)
  ).size;
  if (projectCount > 0 || threadCount > 0) {
    throw new Error(
      `“${holder?.name ?? "This publisher"}” is linked to ${projectCount} project${projectCount === 1 ? "" : "s"} and ${threadCount} correspondence thread${threadCount === 1 ? "" : "s"}. Merge it into the correct publisher instead of deleting it.`
    );
  }
  await db.delete(rightsHolders).where(eq(rightsHolders.id, id));
  revalidateHolderDirectory();
  return {};
}

const normalizeContact = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function mergeHolder(sourceId: string, targetId: string) {
  await requireRole("manager");
  if (sourceId === targetId) throw new Error("Choose a different publisher.");

  await db.transaction(async (tx) => {
    const holders = await tx
      .select()
      .from(rightsHolders)
      .where(or(eq(rightsHolders.id, sourceId), eq(rightsHolders.id, targetId)));
    const source = holders.find((holder) => holder.id === sourceId);
    const target = holders.find((holder) => holder.id === targetId);
    if (!source || !target) throw new Error("Publisher not found.");

    const [sourceContacts, targetContacts] = await Promise.all([
      tx
        .select()
        .from(rightsContacts)
        .where(eq(rightsContacts.holderId, sourceId)),
      tx
        .select()
        .from(rightsContacts)
        .where(eq(rightsContacts.holderId, targetId)),
    ]);

    for (const contact of sourceContacts) {
      const duplicate = targetContacts.find(
        (candidate) => {
          const sameEmail =
            contact.email &&
            candidate.email?.toLowerCase() === contact.email.toLowerCase();
          const sameName =
            normalizeContact(candidate.name) === normalizeContact(contact.name);
          return (
            sameEmail || (sameName && (!contact.email || !candidate.email))
          );
        }
      );
      if (duplicate) {
        await tx
          .update(rightsContacts)
          .set({
            email: duplicate.email || contact.email,
            phone: duplicate.phone || contact.phone,
            role: duplicate.role || contact.role,
          })
          .where(eq(rightsContacts.id, duplicate.id));
        await tx
          .update(rightsItems)
          .set({ mouContactId: duplicate.id })
          .where(eq(rightsItems.mouContactId, contact.id));
        await tx
          .update(rightsItems)
          .set({ licenseContactId: duplicate.id })
          .where(eq(rightsItems.licenseContactId, contact.id));
        await tx
          .update(emailThreads)
          .set({ contactId: duplicate.id, updatedAt: new Date() })
          .where(eq(emailThreads.contactId, contact.id));
        await tx.delete(rightsContacts).where(eq(rightsContacts.id, contact.id));
      } else {
        await tx
          .update(rightsContacts)
          .set({ holderId: targetId })
          .where(eq(rightsContacts.id, contact.id));
        targetContacts.push({ ...contact, holderId: targetId });
      }
    }

    await tx
      .update(rightsItems)
      .set({ mouHolderId: targetId, updatedAt: new Date() })
      .where(eq(rightsItems.mouHolderId, sourceId));
    await tx
      .update(rightsItems)
      .set({ licenseHolderId: targetId, updatedAt: new Date() })
      .where(eq(rightsItems.licenseHolderId, sourceId));
    await tx
      .update(rightsItems)
      .set({ copyrightHolderId: targetId, updatedAt: new Date() })
      .where(eq(rightsItems.copyrightHolderId, sourceId));
    await tx
      .update(emailThreads)
      .set({ holderId: targetId, updatedAt: new Date() })
      .where(eq(emailThreads.holderId, sourceId));
    await tx
      .update(rightsHolders)
      .set({
        website: target.website || source.website,
        notes: target.notes || source.notes,
        updatedAt: new Date(),
      })
      .where(eq(rightsHolders.id, targetId));
    await tx.delete(rightsHolders).where(eq(rightsHolders.id, sourceId));
  });

  revalidateHolderDirectory();
  return {};
}
