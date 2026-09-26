"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  chatChannels,
  emailMessages,
  emailProjectUpdateSuggestions,
  emailProjectSuggestions,
  emailThreadProjects,
  emailThreads,
  fileAttachments,
  files,
  notifications,
  partnerContacts,
  partners,
  printContacts,
  printQuotes,
  printThreadLinks,
  budgetScopePresentations,
  projectBudgetSettings,
  projectPrintSettings,
  projects,
  rightsContacts,
  rightsHolders,
} from "@/lib/db/schema";
import { defaultProjectChannelRows } from "@/lib/chat/project-channels";
import { getThread, replyContext } from "@/lib/email/queries";
import { nextPrimaryProjectId } from "@/lib/email/thread-link";
import { ensureThreadProjectLink } from "@/lib/email/thread-projects";
import {
  enqueueEmailRightsReviewsForThread,
  processEmailRightsReviews,
  reconcileEmailRightsReviewsForThread,
} from "@/lib/email/rights-review";
import { reviewPossibleNewProject } from "@/lib/email/project-signal";
import {
  canSendAsCorrespondenceAddress,
  getCaptureMailbox,
  sendEmail,
  syncStoredMessageAttachments,
} from "@/lib/gmail";
import { extractForwardedHeaderHints } from "@/lib/gmail/forwarded";
import { attributeUserByEmail, resolveThreadLink } from "@/lib/gmail/link";
import { linkPrintThread } from "@/lib/print/email-link";
import {
  createRunFromTextQuote,
  parsedTextQuotes,
} from "@/lib/print/email-text-quote";
import { runTextQuoteExtraction } from "@/lib/print/email-text-extract";
import {
  extractPrintInvoice,
  syncAcceptedInvoiceFiles,
} from "@/lib/print/extract";
import { looksLikePrintFinanceFile } from "@/lib/print/finance-attachment";
import {
  looksLikePrintProofAttachment,
  PRINT_PROOF_ATTACHMENT_LABEL,
} from "@/lib/print/proof-attachment";
import { advancePrintRunStatus } from "@/lib/print/run-status";
import { ensureAcceptedInvoicePaymentTasks } from "@/lib/print/payment-tasks";
import { invoiceFilePaymentKinds } from "@/lib/print/quote-reconciliation";
import { uniqueProjectSlug } from "@/lib/slug";
import {
  clearPossibleCounterpartyNotifications,
  clearPossibleGrantReminderNotifications,
  clearPossibleProjectNotifications,
} from "@/lib/notifications";
import { createObligation } from "@/lib/obligations/actions";
import { projectOwnerId } from "@/lib/obligations/generate";
import { insertTaskRow } from "@/lib/tasks/create";
import { findHolderMatch } from "@/lib/rights/holder-match";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  ensurePrintProofTaskSuggestion,
  reviewForwardedEmailTasks,
} from "@/lib/email/task-suggestions";
import { latestReplyText } from "@/lib/email/follow-up-policy";
import { removeEmailDraftForUser } from "@/lib/email/draft-store";
import { resolveFundingPartnerDirectoryMatch } from "@/lib/email/counterparty-match";
import {
  ensureFollowUpForThread,
  reassignFollowUpOwnerForThread,
  resolveFollowUpForThread,
  resolveRelatedPrintFollowUps,
} from "@/lib/email/follow-ups";
import {
  clearProjectUpdateSuggestionNotifications,
  ensurePrintProofProjectUpdateSuggestion,
} from "@/lib/email/project-update-suggestions";
import { postProjectUpdate } from "@/lib/projects/status-actions";

/** Revalidate the inbox + the rights/print tab of every linked project. */
async function revalidateThread(threadId: string) {
  revalidatePath("/correspondence", "layout");
  revalidatePath(`/correspondence/${threadId}`);
  revalidatePath("/tasks");
  const linked = await db
    .select({ slug: projects.slug })
    .from(emailThreadProjects)
    .innerJoin(projects, eq(projects.id, emailThreadProjects.projectId))
    .where(eq(emailThreadProjects.threadId, threadId));
  for (const p of linked) {
    revalidatePath(`/projects/${p.slug}`);
    revalidatePath(`/projects/${p.slug}/rights`);
    revalidatePath(`/projects/${p.slug}/print`);
  }
}

const statusSchema = z.enum(["open", "waiting", "done"]);

export async function setThreadStatus(threadId: string, status: string) {
  await requireRole("manager");
  const value = statusSchema.parse(status);
  await db
    .update(emailThreads)
    .set({ status: value, updatedAt: new Date() })
    .where(eq(emailThreads.id, threadId));
  if (value === "waiting") await ensureFollowUpForThread(threadId);
  else await resolveFollowUpForThread(threadId);
  await revalidateThread(threadId);
}

/**
 * Link a thread to a project (many-to-many). Upserts the join row and, when the
 * thread has no primary yet, adopts this project as the backward-compatible
 * primary (`emailThreads.projectId`). Idempotent.
 */
export async function linkThreadProject(threadId: string, projectId: string) {
  await requireRole("manager");
  await db.transaction(async (tx) => {
    await ensureThreadProjectLink(tx, threadId, projectId, {
      linkedManually: true,
    });
    await tx
      .update(emailThreads)
      .set({ projectId, linkedManually: true, updatedAt: new Date() })
      .where(and(eq(emailThreads.id, threadId), isNull(emailThreads.projectId)));
  });
  await ensureFollowUpForThread(threadId);
  await clearPossibleProjectNotifications(threadId);
  const rightsReviewIds = await enqueueEmailRightsReviewsForThread(threadId, [
    projectId,
  ]);
  await revalidateThread(threadId);
  after(() =>
    processEmailRightsReviews(rightsReviewIds).catch((error) =>
      console.error("linked email rights-document review failed:", error)
    )
  );
}

/**
 * Remove one of a thread's project links. If the removed project was the primary,
 * promote the oldest remaining link (or clear the primary when none remain).
 */
export async function unlinkThreadProject(threadId: string, projectId: string) {
  await requireRole("manager");
  await db.transaction(async (tx) => {
    await tx
      .delete(emailThreadProjects)
      .where(
        and(
          eq(emailThreadProjects.threadId, threadId),
          eq(emailThreadProjects.projectId, projectId)
        )
      );
    const [current] = await tx
      .select({ projectId: emailThreads.projectId })
      .from(emailThreads)
      .where(eq(emailThreads.id, threadId))
      .limit(1);
    const remaining = await tx
      .select({ projectId: emailThreadProjects.projectId })
      .from(emailThreadProjects)
      .where(eq(emailThreadProjects.threadId, threadId))
      .orderBy(emailThreadProjects.createdAt);
    const nextPrimary = nextPrimaryProjectId(
      current?.projectId ?? null,
      projectId,
      remaining.map((row) => row.projectId)
    );
    if (nextPrimary !== (current?.projectId ?? null)) {
      await tx
        .update(emailThreads)
        .set({ projectId: nextPrimary, updatedAt: new Date() })
        .where(eq(emailThreads.id, threadId));
    }
  });
  const [remainingLink] = await db
    .select({ id: emailThreadProjects.id })
    .from(emailThreadProjects)
    .where(eq(emailThreadProjects.threadId, threadId))
    .limit(1);
  if (!remainingLink) await resolveFollowUpForThread(threadId);
  // Revalidate before the link is gone from context: the project we just removed
  // also needs its rights tab refreshed, so refresh it explicitly.
  await revalidateThread(threadId);
  const [removed] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (removed) {
    revalidatePath(`/projects/${removed.slug}`);
    revalidatePath(`/projects/${removed.slug}/rights`);
    revalidatePath(`/projects/${removed.slug}/print`);
  }
}

/**
 * Link a thread to SEVERAL existing projects at once and dismiss its pending
 * new-project suggestions. Used when an email is from a funder who already funds
 * those projects (a known grant), so its "new projects" are really that grant's
 * existing work — link, don't duplicate.
 */
export async function linkThreadToProjects(
  threadId: string,
  projectIds: string[]
): Promise<{ error?: string }> {
  await requireRole("manager");
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (ids.length === 0) return { error: "No projects to link." };
  await db.transaction(async (tx) => {
    for (const projectId of ids) {
      await ensureThreadProjectLink(tx, threadId, projectId, {
        linkedManually: true,
      });
    }
    await tx
      .update(emailThreads)
      .set({ projectId: ids[0], linkedManually: true, updatedAt: new Date() })
      .where(and(eq(emailThreads.id, threadId), isNull(emailThreads.projectId)));
    // These "new projects" belong to the linked grant, not new work.
    await tx
      .update(emailProjectSuggestions)
      .set({
        status: "dismissed",
        dismissReason: "Belongs to an existing grant for this funder.",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailProjectSuggestions.threadId, threadId),
          eq(emailProjectSuggestions.status, "pending")
        )
      );
  });
  await ensureFollowUpForThread(threadId);
  await clearPossibleProjectNotifications(threadId);
  const rightsReviewIds = await enqueueEmailRightsReviewsForThread(threadId, ids);
  await revalidateThread(threadId);
  revalidatePath(`/correspondence/${threadId}/review`);
  after(() =>
    processEmailRightsReviews(rightsReviewIds).catch((error) =>
      console.error("linked email rights-document review failed:", error)
    )
  );
  return {};
}

const correspondenceProjectSchema = z.object({
  threadId: z.string().uuid(),
  title: z.string().trim().min(1, "Project title is required.").max(200),
  description: z.string().trim().max(2_000).optional(),
  kind: z.enum(["book", "article", "podcast", "video_series", "other"]),
  videoProductionMode: z.enum(["original", "translation"]).optional(),
});

export type CorrespondenceProjectResult = {
  error?: string;
  project?: { id: string; slug: string; label: string };
};

/**
 * Once no `pending` project suggestions remain for a thread, mark its
 * `possible_new_project` notifications read so they stop nagging.
 */
async function clearProjectNotificationsIfResolved(threadId: string) {
  const [pending] = await db
    .select({ id: emailProjectSuggestions.id })
    .from(emailProjectSuggestions)
    .where(
      and(
        eq(emailProjectSuggestions.threadId, threadId),
        eq(emailProjectSuggestions.status, "pending")
      )
    )
    .limit(1);
  if (!pending) await clearPossibleProjectNotifications(threadId);
}

function revalidateReview(threadId: string) {
  revalidatePath(`/correspondence/${threadId}/review`);
  revalidatePath(`/correspondence/${threadId}`);
  revalidatePath("/dashboard");
}

/** Trim + cap an optional dismissal reason; null when empty. */
function normalizeDismissReason(reason?: string): string | null {
  const trimmed = (reason ?? "").trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

/**
 * Dismiss one AI-suggested new project without changing the thread. An optional
 * `reason` records why it wasn't a new project — human ground truth the
 * email-signal reflection pass learns from.
 */
export async function dismissProjectSuggestion(
  suggestionId: string,
  reason?: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const [row] = await db
    .update(emailProjectSuggestions)
    .set({
      status: "dismissed",
      dismissReason: normalizeDismissReason(reason),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailProjectSuggestions.id, suggestionId),
        eq(emailProjectSuggestions.status, "pending")
      )
    )
    .returning({ threadId: emailProjectSuggestions.threadId });
  if (!row) return { error: "This suggestion is no longer available." };
  await clearProjectNotificationsIfResolved(row.threadId);
  revalidateReview(row.threadId);
  return {};
}

/**
 * Dismiss every remaining AI-suggested new project for a thread. An optional
 * `reason` is stored on each dismissed row so the reflection pass can learn what
 * is not a new project.
 */
export async function dismissAllProjectSuggestions(
  threadId: string,
  reason?: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  await db
    .update(emailProjectSuggestions)
    .set({
      status: "dismissed",
      dismissReason: normalizeDismissReason(reason),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailProjectSuggestions.threadId, threadId),
        eq(emailProjectSuggestions.status, "pending")
      )
    );
  await clearPossibleProjectNotifications(threadId);
  revalidateReview(threadId);
  return {};
}

/** The transaction handle drizzle passes to `db.transaction(tx => …)`. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type WorkspaceDefaults = Awaited<ReturnType<typeof getWorkspaceSettings>>;

/** Seed a freshly created project's channels, budget, and print settings. */
async function seedProjectDefaults(
  tx: Tx,
  projectId: string,
  workspace: WorkspaceDefaults
) {
  await tx.insert(chatChannels).values(defaultProjectChannelRows(projectId));
  await Promise.all([
    tx
      .insert(projectBudgetSettings)
      .values({
        projectId,
        wordsPerPage: workspace.wordsPerPage,
        currency: workspace.defaultCurrency,
        rateTranslation: workspace.rateTranslation,
        rateProofreading: workspace.rateProofreading,
        rateEditing: workspace.rateEditing,
        rateCoverDesign: workspace.rateCoverDesign,
        rateTypesetting: workspace.rateTypesetting,
        rateProjectManagement: workspace.rateProjectManagement,
        ratePrintShip: workspace.ratePrintShip,
        rateAudiobook: workspace.rateAudiobook,
        rateVideoSeries: workspace.rateVideoSeries,
      })
      .onConflictDoNothing(),
    tx
      .insert(projectPrintSettings)
      .values({
        projectId,
        trimWidthIn: workspace.trimWidthIn,
        trimHeightIn: workspace.trimHeightIn,
        languageExpansionFactor: workspace.languageExpansionFactor,
        financialEmail: workspace.financialEmail ?? "",
        ccEmails: workspace.defaultCcEmails,
      })
      .onConflictDoNothing(),
    tx
      .insert(budgetScopePresentations)
      .values({
        projectId,
        mode: "itemized",
        deductionBps: workspace.defaultFundingDeductionBps,
      })
      .onConflictDoNothing(),
  ]);
}

/** Create a project without navigating away, then atomically link this thread. */
export async function createProjectFromThread(
  input: z.infer<typeof correspondenceProjectSchema>
): Promise<CorrespondenceProjectResult> {
  const { user } = await requireRole("manager");
  const parsed = correspondenceProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid project." };
  }

  const slug = await uniqueProjectSlug(parsed.data.title);
  const workspace = await getWorkspaceSettings();
  const project = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(projects)
      .values({
        slug,
        title: parsed.data.title,
        description: parsed.data.description || null,
        kind: parsed.data.kind,
        videoProductionMode:
          parsed.data.kind === "video_series"
            ? parsed.data.videoProductionMode ?? "original"
            : null,
        status: "planning",
        priority: "medium",
        sourceLanguage: workspace.sourceLanguage,
        targetLanguage: workspace.targetLanguage,
        createdBy: user.id,
      })
      .returning({ id: projects.id, slug: projects.slug, label: projects.title });

    const [threadRow] = await tx
      .select({ projectId: emailThreads.projectId })
      .from(emailThreads)
      .where(eq(emailThreads.id, parsed.data.threadId))
      .limit(1);
    if (!threadRow) throw new Error("Correspondence thread not found.");
    // Adopt the new project as the primary only when the thread has none yet;
    // always record the many-to-many link.
    await tx
      .update(emailThreads)
      .set({
        projectId: threadRow.projectId ?? created.id,
        linkedManually: true,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, parsed.data.threadId));
    await ensureThreadProjectLink(tx, parsed.data.threadId, created.id, {
      linkedManually: true,
    });

    await seedProjectDefaults(tx, created.id, workspace);
    return created;
  });

  revalidatePath("/projects");
  await ensureFollowUpForThread(parsed.data.threadId);
  await clearPossibleProjectNotifications(parsed.data.threadId);
  const rightsReviewIds = await enqueueEmailRightsReviewsForThread(
    parsed.data.threadId,
    [project.id]
  );
  await revalidateThread(parsed.data.threadId);
  after(() =>
    processEmailRightsReviews(rightsReviewIds).catch((error) =>
      console.error("created project email rights-document review failed:", error)
    )
  );
  return { project };
}

const bulkProjectSchema = z.object({
  threadId: z.string().uuid(),
  candidates: z
    .array(
      z.object({
        suggestionId: z.string().uuid(),
        title: z.string().trim().min(1, "Project title is required.").max(200),
        description: z.string().trim().max(2_000).optional(),
        kind: z.enum(["book", "article", "podcast", "video_series", "other"]),
        videoProductionMode: z.enum(["original", "translation"]).nullable().optional(),
      })
    )
    .min(1, "Select at least one project to create.")
    .max(20),
});

export type CreateProjectsResult = {
  error?: string;
  projects?: { id: string; slug: string; label: string }[];
};

/**
 * Create several projects from a thread's reviewed suggestions in one shot, then
 * link every one to the thread (many-to-many). Each suggestion is claimed with a
 * conditional `pending → created` update inside the transaction, so a
 * double-submit or stale re-post never double-creates.
 */
export async function createProjectsFromThread(
  input: z.infer<typeof bulkProjectSchema>
): Promise<CreateProjectsResult> {
  const { user } = await requireRole("manager");
  const parsed = bulkProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid projects." };
  }

  const workspace = await getWorkspaceSettings();
  // Pre-resolve slugs before the transaction so siblings created together never
  // collide on the same slug.
  const taken = new Set<string>();
  const withSlugs: Array<
    (typeof parsed.data.candidates)[number] & { slug: string }
  > = [];
  for (const candidate of parsed.data.candidates) {
    withSlugs.push({
      ...candidate,
      slug: await uniqueProjectSlug(candidate.title, taken),
    });
  }

  const created = await db.transaction(async (tx) => {
    const [threadRow] = await tx
      .select({ projectId: emailThreads.projectId })
      .from(emailThreads)
      .where(eq(emailThreads.id, parsed.data.threadId))
      .limit(1);
    if (!threadRow) throw new Error("Correspondence thread not found.");

    let primaryId = threadRow.projectId;
    const results: { id: string; slug: string; label: string }[] = [];
    for (const candidate of withSlugs) {
      // Claim the suggestion; skip if it was already created/dismissed.
      const [claimed] = await tx
        .update(emailProjectSuggestions)
        .set({ status: "created", updatedAt: new Date() })
        .where(
          and(
            eq(emailProjectSuggestions.id, candidate.suggestionId),
            eq(emailProjectSuggestions.threadId, parsed.data.threadId),
            eq(emailProjectSuggestions.status, "pending")
          )
        )
        .returning({ id: emailProjectSuggestions.id });
      if (!claimed) continue;

      const [project] = await tx
        .insert(projects)
        .values({
          slug: candidate.slug,
          title: candidate.title,
          description: candidate.description || null,
          kind: candidate.kind,
          videoProductionMode:
            candidate.kind === "video_series"
              ? candidate.videoProductionMode ?? "original"
              : null,
          status: "planning",
          priority: "medium",
          sourceLanguage: workspace.sourceLanguage,
          targetLanguage: workspace.targetLanguage,
          createdBy: user.id,
        })
        .returning({
          id: projects.id,
          slug: projects.slug,
          label: projects.title,
        });

      await tx
        .update(emailProjectSuggestions)
        .set({ createdProjectId: project.id })
        .where(eq(emailProjectSuggestions.id, candidate.suggestionId));
      await ensureThreadProjectLink(tx, parsed.data.threadId, project.id, {
        linkedManually: true,
      });
      await seedProjectDefaults(tx, project.id, workspace);
      primaryId = primaryId ?? project.id;
      results.push(project);
    }

    if (results.length) {
      await tx
        .update(emailThreads)
        .set({ projectId: primaryId, linkedManually: true, updatedAt: new Date() })
        .where(eq(emailThreads.id, parsed.data.threadId));
    }
    return results;
  });

  if (!created.length) {
    return { error: "These suggestions were already handled." };
  }

  revalidatePath("/projects");
  await ensureFollowUpForThread(parsed.data.threadId);
  await clearProjectNotificationsIfResolved(parsed.data.threadId);
  const rightsReviewIds = await enqueueEmailRightsReviewsForThread(
    parsed.data.threadId,
    created.map((project) => project.id)
  );
  await revalidateThread(parsed.data.threadId);
  after(() =>
    processEmailRightsReviews(rightsReviewIds).catch((error) =>
      console.error("created projects email rights-document review failed:", error)
    )
  );
  return { projects: created };
}

const counterpartyNotificationSchema = z.object({
  threadId: z.string().uuid(),
  counterparty: z.object({
    type: z.enum(["rights_holder", "funding_partner", "printer"]),
    name: z.string().trim().min(1).max(200),
    contactName: z.string().trim().max(200),
    email: z.string().trim().max(320),
    existingId: z.string().uuid().nullable(),
  }),
});

export async function acceptCounterpartySuggestion(
  notificationId: string,
  fundingPartnerId?: string
): Promise<{ error?: string; label?: string; message?: string }> {
  const { user } = await requireRole("manager");
  const [notification] = await db
    .select({ data: notifications.data })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        eq(notifications.type, "possible_counterparty"),
        isNull(notifications.readAt)
      )
    )
    .limit(1);
  const parsed = counterpartyNotificationSchema.safeParse(notification?.data);
  if (!parsed.success) return { error: "This suggestion is no longer available." };
  const selectedFundingPartnerId = z.string().uuid().optional().safeParse(
    fundingPartnerId
  );
  if (!selectedFundingPartnerId.success) {
    return { error: "Choose a valid funding partner." };
  }

  const { threadId, counterparty } = parsed.data;
  let label = counterparty.name;
  let message: string | undefined;
  await db.transaction(async (tx) => {
    if (counterparty.type === "rights_holder") {
      const holders = await tx
        .select({ id: rightsHolders.id, name: rightsHolders.name })
        .from(rightsHolders);
      let holder = counterparty.existingId
        ? holders.find((row) => row.id === counterparty.existingId)
        : null;
      holder ??= findHolderMatch(counterparty.name, holders);
      if (!holder) {
        [holder] = await tx
          .insert(rightsHolders)
          .values({ name: counterparty.name })
          .returning({ id: rightsHolders.id, name: rightsHolders.name });
      }
      label = holder.name;
      let contactId: string | null = null;
      if (counterparty.email) {
        const [existingContact] = await tx
          .select({ id: rightsContacts.id })
          .from(rightsContacts)
          .where(
            and(
              eq(rightsContacts.holderId, holder.id),
              eq(rightsContacts.email, counterparty.email.toLowerCase())
            )
          )
          .limit(1);
        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const [contact] = await tx
            .insert(rightsContacts)
            .values({
              holderId: holder.id,
              name: counterparty.contactName || counterparty.email,
              email: counterparty.email.toLowerCase(),
            })
            .returning({ id: rightsContacts.id });
          contactId = contact.id;
        }
      }
      await tx
        .update(emailThreads)
        .set({ holderId: holder.id, contactId, updatedAt: new Date() })
        .where(eq(emailThreads.id, threadId));
    } else if (counterparty.type === "funding_partner") {
      const [organizations, contacts] = await Promise.all([
        tx.select({ id: partners.id, name: partners.name }).from(partners),
        tx
          .select({
            id: partnerContacts.id,
            partnerId: partnerContacts.partnerId,
            email: partnerContacts.email,
          })
          .from(partnerContacts),
      ]);
      const match = resolveFundingPartnerDirectoryMatch(
        counterparty,
        organizations,
        contacts
      );
      let partner = selectedFundingPartnerId.data
        ? organizations.find((row) => row.id === selectedFundingPartnerId.data)
        : match.organizationId
          ? organizations.find((row) => row.id === match.organizationId)
          : null;
      if (selectedFundingPartnerId.data && !partner) {
        throw new Error("The selected funding partner no longer exists.");
      }
      let organizationCreated = false;
      if (!partner) {
        [partner] = await tx
          .insert(partners)
          .values({ name: counterparty.name, createdBy: user.id })
          .returning({ id: partners.id, name: partners.name });
        organizationCreated = true;
      }
      label = partner.name;
      let partnerContactId: string | null = null;
      let contactCreated = false;
      if (counterparty.email) {
        const existingContact = contacts.find(
          (row) =>
            row.partnerId === partner.id &&
            row.email?.trim().toLowerCase() ===
              counterparty.email.trim().toLowerCase()
        );
        if (existingContact) {
          partnerContactId = existingContact.id;
        } else {
          const names = counterparty.contactName.trim().split(/\s+/).filter(Boolean);
          const [contact] = await tx
            .insert(partnerContacts)
            .values({
              partnerId: partner.id,
              firstName: names[0] ?? null,
              lastName: names.slice(1).join(" ") || null,
              email: counterparty.email.toLowerCase(),
              isPrimary: !contacts.some((row) => row.partnerId === partner.id),
            })
            .returning({ id: partnerContacts.id });
          partnerContactId = contact.id;
          contactCreated = true;
        }
      }
      const contactLabel = counterparty.contactName || counterparty.email;
      message = organizationCreated
        ? contactCreated
          ? `Created ${label}, added ${contactLabel} as a contact, and linked this thread.`
          : `Created ${label} and linked this thread.`
        : contactCreated
          ? `Added ${contactLabel} to ${label} and linked this thread.`
          : partnerContactId
            ? `Linked ${label} and ${contactLabel} to this thread.`
            : `Linked ${label} to this thread.`;
      await tx
        .update(emailThreads)
        .set({
          partnerId: partner.id,
          partnerContactId,
          updatedAt: new Date(),
        })
        .where(eq(emailThreads.id, threadId));
    } else {
      const contacts = await tx
        .select({ id: printContacts.id, name: printContacts.name })
        .from(printContacts);
      let printer = counterparty.existingId
        ? contacts.find((row) => row.id === counterparty.existingId)
        : null;
      if (!printer) {
        [printer] = await tx
          .insert(printContacts)
          .values({
            name: counterparty.contactName || counterparty.name,
            company: counterparty.name,
            email: counterparty.email.toLowerCase() || null,
          })
          .returning({ id: printContacts.id, name: printContacts.name });
      }
      label = counterparty.name;
      await tx
        .insert(printThreadLinks)
        .values({
          threadId,
          contactId: printer.id,
          matchedBy: "ai_review",
        })
        .onConflictDoUpdate({
          target: printThreadLinks.threadId,
          set: {
            contactId: printer.id,
            matchedBy: "ai_review",
            updatedAt: new Date(),
          },
        });
    }
  });

  await clearPossibleCounterpartyNotifications(threadId);
  await revalidateThread(threadId);
  revalidatePath("/settings/publishers");
  revalidatePath("/settings/partners");
  revalidatePath("/settings/printers");
  return { label, message };
}

export async function dismissCounterpartySuggestion(notificationId: string) {
  const { user } = await requireRole("manager");
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        eq(notifications.type, "possible_counterparty")
      )
    )
    .returning({ data: notifications.data });
  const parsed = counterpartyNotificationSchema.safeParse(row?.data);
  if (parsed.success) {
    revalidatePath(`/correspondence/${parsed.data.threadId}`);
  }
  revalidatePath("/dashboard");
}

const grantReminderNotificationSchema = z.object({
  threadId: z.string().uuid(),
  reminders: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        detail: z.string().trim().max(4_000).default(""),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null),
        recurring: z.boolean(),
        cadence: z.enum(["one_off", "monthly", "quarterly", "annual"]),
      })
    )
    .min(1),
  targetProjectIds: z.array(z.string().uuid()).default([]),
  targetTitles: z.array(z.string()).default([]),
});

const acceptGrantReminderInputSchema = z.object({
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  projectIds: z.array(z.string().uuid()).optional(),
});

/**
 * Approve an AI-suggested grant reminder: for each selected project, turn each
 * extracted deliverable into a dated task (one-off) or a recurring grant
 * obligation (monthly/quarterly/annual). Review-first — nothing is created until
 * a manager approves here. Claims the notification (read) before creating so a
 * double-submit can't duplicate the tasks/obligations.
 */
export async function acceptGrantReminder(
  notificationId: string,
  input: { dueDate?: string; projectIds?: string[] } = {}
): Promise<{ error?: string; created?: number }> {
  const { user } = await requireRole("manager");
  const parsedInput = acceptGrantReminderInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { error: "Invalid due date or project selection." };
  }

  const [notification] = await db
    .select({ data: notifications.data, readAt: notifications.readAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        eq(notifications.type, "possible_grant_reminder")
      )
    )
    .limit(1);
  if (!notification) return { error: "This suggestion is no longer available." };
  // Idempotent: already handled by this or another manager — do not recreate.
  if (notification.readAt) return { created: 0 };

  const parsed = grantReminderNotificationSchema.safeParse(notification.data);
  if (!parsed.success) return { error: "This suggestion is no longer available." };
  const { threadId, reminders, targetProjectIds } = parsed.data;

  const requested = parsedInput.data.projectIds?.length
    ? parsedInput.data.projectIds.filter((id) => targetProjectIds.includes(id))
    : targetProjectIds;
  if (!requested.length) return { error: "Select at least one project." };

  // Claim the notification first so a concurrent/double submit no-ops instead
  // of creating the tasks/obligations twice.
  const [claimed] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        eq(notifications.type, "possible_grant_reminder"),
        isNull(notifications.readAt)
      )
    )
    .returning({ id: notifications.id });
  if (!claimed) return { created: 0 };

  let created = 0;
  for (const projectId of requested) {
    // Report reminders default their owner to the project creator, matching the
    // obligation/import path, so someone is reminded even without an assignee.
    const ownerId = await projectOwnerId(projectId);
    for (const reminder of reminders) {
      const dueDate = parsedInput.data.dueDate ?? reminder.dueDate ?? undefined;
      if (reminder.recurring && reminder.cadence !== "one_off") {
        await createObligation(projectId, {
          kind: "analytics_report",
          cadence: reminder.cadence,
          label: reminder.title,
          text: reminder.detail || reminder.title,
          assigneeId: ownerId,
          anchorDate: dueDate,
        });
      } else {
        await insertTaskRow(
          {
            projectId,
            title: reminder.title,
            description: reminder.detail || reminder.title,
            dueDate: dueDate ?? null,
            dueDateIsManual: true,
            assignedTo: ownerId,
            priority: "medium",
          },
          {
            actorId: user.id,
            activitySummary: `Created grant reminder task "${reminder.title}"`,
          }
        );
      }
      created += 1;
    }
  }

  // Resolve any sibling managers' pending reminder notifications for this thread.
  await clearPossibleGrantReminderNotifications(threadId);
  await revalidateThread(threadId);
  return { created };
}

/** Dismiss an AI-suggested grant reminder without creating anything. */
export async function dismissGrantReminder(notificationId: string) {
  const { user } = await requireRole("manager");
  const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, user.id),
        eq(notifications.type, "possible_grant_reminder")
      )
    )
    .returning({ data: notifications.data });
  const parsed = grantReminderNotificationSchema.safeParse(row?.data);
  if (parsed.success) {
    await clearPossibleGrantReminderNotifications(parsed.data.threadId);
    revalidatePath(`/correspondence/${parsed.data.threadId}`);
  }
  revalidatePath("/dashboard");
}

export async function assignThread(threadId: string, userId: string | null) {
  await requireRole("manager");
  await db
    .update(emailThreads)
    .set({ assigneeId: userId ?? null, updatedAt: new Date() })
    .where(eq(emailThreads.id, threadId));
  await reassignFollowUpOwnerForThread(threadId, userId);
  await revalidateThread(threadId);
}

function messageParticipants(message: {
  fromAddr: string | null;
  toAddrs: string[] | null;
  ccAddrs: string[] | null;
  subject: string | null;
  bodyText: string | null;
}) {
  const forwarded = extractForwardedHeaderHints({
    subject: message.subject,
    text: message.bodyText,
  });
  return {
    emails: [
      message.fromAddr,
      ...(message.toAddrs ?? []),
      ...(message.ccAddrs ?? []),
      ...forwarded.emails,
    ].filter((email): email is string => !!email),
    names: forwarded.names,
  };
}

/**
 * Read-only thread + messages for the print-page correspondence modal. Manager
 * gating is enforced inside getThread(); this only exposes it to a client caller
 * so a printer thread can be opened in place without a full-page navigation.
 */
export async function getThreadForModal(threadId: string) {
  return getThread(threadId);
}

export type ReprocessEmailResult = {
  error?: string;
  quotesCreated?: number;
  printLinked?: boolean;
  aiSuggestionCreated?: boolean;
  taskSuggestionsCreated?: number;
  rightsReviewsCreated?: number;
  proofFilesStored?: number;
  projectUpdateSuggestionsCreated?: number;
};

/** Re-run the complete captured thread through the correspondence pipeline. */
export async function reprocessThread(
  threadId: string
): Promise<ReprocessEmailResult> {
  return reprocessCorrespondence(threadId);
}

/** Re-run only one captured message without rescanning its sibling messages. */
export async function reprocessMessage(
  messageId: string
): Promise<ReprocessEmailResult> {
  const parsedMessageId = z.string().uuid().safeParse(messageId);
  if (!parsedMessageId.success) return { error: "Email not found." };

  await requireRole("manager");
  const [message] = await db
    .select({ threadId: emailMessages.threadId })
    .from(emailMessages)
    .where(eq(emailMessages.id, parsedMessageId.data))
    .limit(1);
  if (!message) return { error: "Email not found." };

  return reprocessCorrespondence(message.threadId, parsedMessageId.data);
}

/**
 * Re-run deterministic linking/extraction for a captured thread or one message.
 * A scoped reprocess keeps pending suggestions from sibling messages intact.
 */
async function reprocessCorrespondence(
  threadId: string,
  targetMessageId?: string
): Promise<ReprocessEmailResult> {
  const { user } = await requireRole("manager");
  const data = await getThread(threadId);
  if (!data) return { error: "Thread not found." };

  const messages = targetMessageId
    ? data.messages.filter((message) => message.id === targetMessageId)
    : data.messages;
  if (!messages.length) return { error: "Email not found in this thread." };

  let bestProjectId = data.thread.projectId;
  let printLinked = false;
  let quotesCreated = 0;
  let taskSuggestionsCreated = 0;
  let proofFilesStored = 0;
  let projectUpdateSuggestionsCreated = 0;

  for (const message of messages) {
    const participants = messageParticipants(message);
    const forwarded = extractForwardedHeaderHints({
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
    });
    if (forwarded.isForwarded) {
      const forwarderUserId =
        message.forwardedByUserId ??
        (await attributeUserByEmail(message.fromAddr));
      if (forwarderUserId) {
        await db
          .update(emailMessages)
          .set({
            forwardedByUserId: forwarderUserId,
            forwarderNote: message.forwarderNote ?? forwarded.forwarderNote,
          })
          .where(eq(emailMessages.id, message.id));
        const taskReview = await reviewForwardedEmailTasks({
          threadId,
          messageId: message.id,
          forwarderUserId,
          forwarderNote: message.forwarderNote ?? forwarded.forwarderNote,
          subject: message.subject,
          originalSender: forwarded.fromEmails[0] ?? message.fromAddr,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          forwardedAt: message.sentAt,
          originalDate: forwarded.originalDate,
          // Manual reprocessing must never surprise someone by creating work.
          suggestionOnly: true,
        }).catch((error) => {
          console.error("manual forwarded email task review failed:", error);
          return { created: 0, suggested: 0 };
        });
        taskSuggestionsCreated += taskReview.suggested;
      }
    }
    const link = await resolveThreadLink(participants.emails, {
      subject: message.subject,
      bodyText: message.bodyText,
      includeQuotedHistory: forwarded.isForwarded,
    });
    const existingProjectId = bestProjectId ?? link.projectId;
    const parsedQuotes = parsedTextQuotes(message.bodyText, {
      includeQuotedHistory: forwarded.isForwarded,
    });
    if (
      !data.thread.linkedManually &&
      (link.projectId ||
        link.holderId ||
        link.contactId ||
        link.partnerId ||
        link.partnerContactId)
    ) {
      if (!bestProjectId && link.projectId) bestProjectId = link.projectId;
      const patch: Partial<typeof emailThreads.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (!data.thread.projectId && link.projectId) patch.projectId = link.projectId;
      if (!data.thread.holderId && link.holderId) patch.holderId = link.holderId;
      if (!data.thread.contactId && link.contactId) patch.contactId = link.contactId;
      if (!data.thread.partnerId && link.partnerId) patch.partnerId = link.partnerId;
      if (!data.thread.partnerContactId && link.partnerContactId) {
        patch.partnerContactId = link.partnerContactId;
      }
      await db
        .update(emailThreads)
        .set(patch)
        .where(eq(emailThreads.id, threadId));
    }

    const printLink = await linkPrintThread({
      threadId,
      participantEmails: participants.emails,
      participantNames: participants.names,
      subject: message.subject ?? data.thread.subject,
      bodyText: message.bodyText,
      includeQuotedHistory: forwarded.isForwarded,
      existingProjectId,
    });
    if (printLink) {
      printLinked = true;
      bestProjectId = printLink.projectId ?? bestProjectId;
    }
    let runId = printLink?.runId ?? null;
    const printProjectId = printLink?.projectId ?? existingProjectId ?? bestProjectId;
    if (!runId && printProjectId && parsedQuotes.length) {
      runId = await createRunFromTextQuote({
        projectId: printProjectId,
        contactId: printLink?.contactId ?? link.contactId ?? null,
        parsedQuotes,
        actorUserId: user.id,
      });
      if (runId) {
        printLinked = true;
        bestProjectId = printProjectId;
        const relink = await linkPrintThread({
          threadId,
          participantEmails: participants.emails,
          participantNames: participants.names,
          subject: message.subject ?? data.thread.subject,
          bodyText: message.bodyText,
          includeQuotedHistory: forwarded.isForwarded,
          existingProjectId: printProjectId,
          runId,
        });
        if (relink?.projectId) bestProjectId = relink.projectId;
      }
    }
    if (runId && printProjectId) {
      if (message.messageIdHeader) {
        const repaired = await syncStoredMessageAttachments({
          messageRowId: message.id,
          messageIdHeader: message.messageIdHeader,
          bodyText: message.bodyText,
          isPrintLinked: true,
          runId,
        }).catch((error) => {
          console.error("manual print attachment repair failed:", error);
          return { stored: 0, proofsStored: 0 };
        });
        proofFilesStored += repaired.proofsStored;
      }

      // AI-first (cross-checked) text extraction, idempotent via the jobs table.
      const res = await runTextQuoteExtraction({
        bodyText: message.bodyText,
        includeQuotedHistory: forwarded.isForwarded,
        projectId: printProjectId,
        runId,
        sourceThreadId: threadId,
        sourceMessageId: message.id,
        actorUserId: user.id,
      });
      quotesCreated += res.created;

      // Re-run AI extraction on stored PDF invoice attachments too — the initial
      // ingest may have missed the forwarded context. Skip PDFs that look like
      // artwork/covers/book interiors (same classifier as ingest) so a proof or
      // the book itself isn't turned into a phantom quote; the extractor's
      // content guard catches generically-named files that slip through.
      const pdfs = await db
        .select({
          fileId: files.id,
          originalName: files.originalName,
          label: fileAttachments.label,
        })
        .from(fileAttachments)
        .innerJoin(files, eq(files.id, fileAttachments.fileId))
        .where(
          and(
            eq(fileAttachments.targetType, "email_message"),
            eq(fileAttachments.targetId, message.id),
            eq(files.mimeType, "application/pdf"),
            eq(files.status, "ready")
          )
        );
      for (const pdf of pdfs) {
        if (pdf.label === PRINT_PROOF_ATTACHMENT_LABEL) continue;
        if (!looksLikePrintFinanceFile(pdf.originalName)) continue;
        const extracted = await extractPrintInvoice({
          fileId: pdf.fileId,
          runId,
          sourceThreadId: threadId,
          sourceMessageId: message.id,
        }).catch((err) => {
          console.error("reprocess pdf extract failed:", err);
          return null;
        });
        if (extracted?.disposition === "created") quotesCreated += 1;
      }

      // Reprocessing any message on the run also repairs staged invoice links
      // created by older releases. This makes the already accepted deposit PDF
      // usable for its deterministic final-balance payment even when the user
      // clicked reprocess on the later final-invoice email.
      const acceptedInvoices = await db
        .select({ id: printQuotes.id, kind: printQuotes.kind })
        .from(printQuotes)
        .where(
          and(
            eq(printQuotes.runId, runId),
            eq(printQuotes.reviewStatus, "accepted")
          )
        );
      for (const accepted of acceptedInvoices) {
        if (!invoiceFilePaymentKinds(accepted.kind).length) continue;
        await syncAcceptedInvoiceFiles(accepted.id);
        await ensureAcceptedInvoicePaymentTasks(
          accepted.id,
          accepted.kind,
          user.id
        );
      }

      if (message.direction === "inbound") {
        await resolveRelatedPrintFollowUps({
          inboundThreadId: threadId,
          runId,
          repliedAt: message.sentAt ?? new Date(),
        });
      }
    }
    if (printProjectId) {
      const storedAttachments = await db
        .select({
          attachmentId: fileAttachments.id,
          label: fileAttachments.label,
          fileName: files.originalName,
          mimeType: files.mimeType,
        })
        .from(fileAttachments)
        .innerJoin(files, eq(files.id, fileAttachments.fileId))
        .where(
          and(
            eq(fileAttachments.targetType, "email_message"),
            eq(fileAttachments.targetId, message.id),
            eq(files.status, "ready")
          )
        );
      const proofAttachments = storedAttachments.filter(
        (attachment) =>
          attachment.label === PRINT_PROOF_ATTACHMENT_LABEL ||
          looksLikePrintProofAttachment({
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            newestBodyText: latestReplyText(message.bodyText),
          })
      );
      for (const attachment of proofAttachments) {
        if (attachment.label === PRINT_PROOF_ATTACHMENT_LABEL) continue;
        await db
          .update(fileAttachments)
          .set({ label: PRINT_PROOF_ATTACHMENT_LABEL })
          .where(eq(fileAttachments.id, attachment.attachmentId));
      }
      if (proofAttachments.length && runId) {
        await advancePrintRunStatus(runId, "proofing");
      }
      if (
        proofAttachments.length &&
        (await ensurePrintProofProjectUpdateSuggestion({
          threadId,
          messageId: message.id,
          projectId: printProjectId,
          bodyText: message.bodyText,
        }).catch((error) => {
          console.error("manual proof project-update suggestion failed:", error);
          return false;
        }))
      ) {
        projectUpdateSuggestionsCreated += 1;
      }
      if (
        message.direction === "inbound" &&
        !forwarded.isForwarded &&
        proofAttachments.length &&
        (await ensurePrintProofTaskSuggestion({
          threadId,
          messageId: message.id,
          projectId: printProjectId,
          toAddrs: message.toAddrs,
          sourceSender: message.fromAddr,
          sourceSubject: message.subject,
          sourceSentAt: message.sentAt,
          bodyText: message.bodyText,
        }).catch((error) => {
          console.error("manual proof task suggestion failed:", error);
          return false;
        }))
      ) {
        taskSuggestionsCreated += 1;
      }
    }
  }

  const inbound = messages.find((message) => message.direction === "inbound");
  const aiSuggestionCreated = await reviewPossibleNewProject(
    {
      threadId,
      fromAddr: inbound?.fromAddr ?? messages[0]?.fromAddr ?? null,
      subject: messages[0]?.subject ?? data.thread.subject,
      bodyText: messages
        .map((message) => {
          const forwarded = extractForwardedHeaderHints({
            subject: message.subject,
            text: message.bodyText,
            html: message.bodyHtml,
          });
          const messageText = forwarded.isForwarded
            ? message.bodyText
            : latestReplyText(message.bodyText);
          return [
            `Direction: ${message.direction}`,
            message.fromAddr ? `From: ${message.fromAddr}` : null,
            messageText,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n--- next message ---\n\n"),
      includeQuotedHistory: true,
    },
    { replaceExisting: !targetMessageId }
  ).catch((error) => {
    console.error("manual email project-signal review failed:", error);
    return false;
  });

  const rightsReviewsCreated = await reconcileEmailRightsReviewsForThread(
    threadId,
    undefined,
    targetMessageId ? { messageIds: [targetMessageId] } : undefined
  );
  await revalidateThread(threadId);
  return {
    quotesCreated,
    printLinked,
    aiSuggestionCreated,
    taskSuggestionsCreated,
    rightsReviewsCreated,
    proofFilesStored,
    projectUpdateSuggestionsCreated,
  };
}

const projectUpdateBodySchema = z
  .string()
  .trim()
  .min(1, "Write an update first.")
  .max(5_000, "The update is too long.");

export async function acceptEmailProjectUpdateSuggestion(
  suggestionId: string,
  body: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const parsedBody = projectUpdateBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return { error: parsedBody.error.issues[0]?.message ?? "Invalid update." };
  }

  const [suggestion] = await db
    .select({
      threadId: emailProjectUpdateSuggestions.threadId,
      projectId: emailProjectUpdateSuggestions.projectId,
      projectSlug: projects.slug,
    })
    .from(emailProjectUpdateSuggestions)
    .innerJoin(projects, eq(projects.id, emailProjectUpdateSuggestions.projectId))
    .where(
      and(
        eq(emailProjectUpdateSuggestions.id, suggestionId),
        eq(emailProjectUpdateSuggestions.status, "pending")
      )
    )
    .limit(1);
  if (!suggestion) {
    return { error: "This suggestion is no longer available." };
  }

  const [claimed] = await db
    .update(emailProjectUpdateSuggestions)
    .set({ status: "created", updatedAt: new Date() })
    .where(
      and(
        eq(emailProjectUpdateSuggestions.id, suggestionId),
        eq(emailProjectUpdateSuggestions.status, "pending")
      )
    )
    .returning({ id: emailProjectUpdateSuggestions.id });
  if (!claimed) return { error: "This suggestion was already handled." };

  let createdUpdateId: string | null;
  try {
    createdUpdateId = await postProjectUpdate(
      suggestion.projectId,
      suggestion.projectSlug,
      parsedBody.data
    );
  } catch (error) {
    await db
      .update(emailProjectUpdateSuggestions)
      .set({ status: "pending", createdUpdateId: null, updatedAt: new Date() })
      .where(eq(emailProjectUpdateSuggestions.id, suggestionId));
    throw error;
  }
  await db
    .update(emailProjectUpdateSuggestions)
    .set({ createdUpdateId, updatedAt: new Date() })
    .where(eq(emailProjectUpdateSuggestions.id, claimed.id))
    .catch((error) =>
      console.error("project update suggestion provenance save failed:", error)
    );
  await clearProjectUpdateSuggestionNotifications(suggestionId);
  await revalidateThread(suggestion.threadId);
  return {};
}

export async function dismissEmailProjectUpdateSuggestion(
  suggestionId: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const [suggestion] = await db
    .update(emailProjectUpdateSuggestions)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(
      and(
        eq(emailProjectUpdateSuggestions.id, suggestionId),
        eq(emailProjectUpdateSuggestions.status, "pending")
      )
    )
    .returning({ threadId: emailProjectUpdateSuggestions.threadId });
  if (!suggestion) {
    return { error: "This suggestion is no longer available." };
  }

  await clearProjectUpdateSuggestionNotifications(suggestionId);
  await revalidateThread(suggestion.threadId);
  return {};
}

/**
 * Reply within a captured thread: sends from the shared mailbox to the thread's
 * most recent inbound sender, attributed to the current manager, and records it.
 */
export async function sendThreadReply(
  threadId: string,
  body: string,
  ccEmails?: string[]
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  if (!(await canSendAsCorrespondenceAddress())) return { error: "Email sending isn't configured yet." };
  const text = (body ?? "").trim();
  if (!text) return { error: "Write a message first." };

  const data = await getThread(threadId);
  if (!data) return { error: "Thread not found." };

  const recipient =
    [...data.messages].reverse().find((m) => m.direction === "inbound")?.fromAddr ??
    data.messages.find((m) => m.fromAddr)?.fromAddr ??
    null;
  if (!recipient) return { error: "No recipient address on this thread." };
  const workspace =
    ccEmails === undefined ? await getWorkspaceSettings() : null;
  const cc = [
    ...new Set(
      (ccEmails ?? workspace?.defaultCcEmails ?? [])
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email && email !== recipient.trim().toLowerCase())
    ),
  ];
  const invalidCc = cc.find(
    (email) => !z.string().email().safeParse(email).success
  );
  if (invalidCc) return { error: `Check CC email: ${invalidCc}` };

  const base = data.thread.subject ?? "(no subject)";
  const subject = /^re:/i.test(base) ? base : `Re: ${base}`;
  const rc = await replyContext(threadId);

  await sendEmail({
    to: [recipient],
    cc,
    subject,
    bodyText: text,
    inReplyTo: rc?.inReplyTo ?? null,
    references: rc?.references ?? null,
    threadKey: rc?.threadKey ?? null,
    actingUserId: user.id,
  });
  await removeEmailDraftForUser(user.id, "thread_reply", threadId);
  await revalidateThread(threadId);
  return {};
}

const logSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  holderId: z.string().uuid().nullable().optional(),
  from: z.string().max(320).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().max(20000).optional(),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
});

/**
 * Manually record a piece of correspondence that happened outside the capture
 * mailbox (paste it in). Creates a synthetic thread + one message. Returns the
 * new threadId.
 */
export async function logManualCorrespondence(
  input: z.infer<typeof logSchema>
): Promise<string> {
  const session = await requireRole("manager");
  const data = logSchema.parse(input);
  const now = new Date();
  const synthetic = `manual:${randomUUID()}`;

  const [thread] = await db
    .insert(emailThreads)
    .values({
      gmailThreadId: synthetic,
      mailbox: (await getCaptureMailbox()) ?? "manual",
      subject: data.subject,
      status: "open",
      lastMessageAt: now,
      lastDirection: data.direction,
      ownerUserId: session.user.id,
      projectId: data.projectId ?? null,
      holderId: data.holderId ?? null,
      linkedManually: !!data.projectId,
    })
    .returning({ id: emailThreads.id });

  await db.insert(emailMessages).values({
    threadId: thread.id,
    gmailMessageId: synthetic,
    direction: data.direction,
    fromAddr: data.from ?? null,
    subject: data.subject,
    bodyText: data.body ?? null,
    snippet: (data.body ?? "").slice(0, 200) || null,
    attributedUserId: session.user.id,
    sentAt: now,
  });

  revalidatePath("/correspondence", "layout");
  return thread.id;
}
