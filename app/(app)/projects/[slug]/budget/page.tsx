import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  projects,
  files,
  rightsContacts,
  rightsHolders,
  rightsItems,
} from "@/lib/db/schema";
import { getProjectHeader, listAssignableUsers } from "@/lib/projects/queries";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import {
  PAYMENT_EPISODE_MILESTONE,
  publishedEpisodeCount,
} from "@/lib/episodes/queries";
import {
  getBudgetData,
  listInvoices,
  listPayments,
  listReceipts,
  listRoyaltyPayments,
} from "@/lib/budget/queries";
import { listLicenseFeePayments } from "@/lib/rights/queries";
import { getProjectAiSpend } from "@/lib/ai/usage-queries";
import { getBudgetReconciliation } from "@/lib/budget/reconcile";
import {
  getOrCreatePrintSettings,
  listPrintQuotes,
  listPrintRuns,
} from "@/lib/print/queries";
import { getPrintQuoteTotal } from "@/lib/print/quote-economics";
import { listProjectSurfaceNotes } from "@/lib/projects/surface-notes-queries";
import { Layers3, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CashflowCard } from "@/components/budget/cashflow-card";
import { ReconciliationPanel } from "@/components/budget/reconciliation-panel";
import { BudgetManager } from "@/components/budget/budget-manager";
import { ProposalPanel } from "@/components/budget/proposal-panel";
import { listProposals } from "@/lib/proposals/queries";
import { listPartnersWithContacts } from "@/lib/partners/queries";
import { FundingReceipts } from "@/components/budget/funding-receipts";
import { MouPayments } from "@/components/budget/mou-payments";
import { RoyaltiesCard } from "@/components/budget/royalties-card";
import { RoyaltyPayments } from "@/components/budget/royalty-payments";
import { LicenseFeePayments } from "@/components/rights/license-fee-payments";
import { ProjectSurfaceNotes } from "@/components/projects/project-surface-notes";
import { cn } from "@/lib/utils";
import { listSharedMouGroupsForProject } from "@/lib/agreements/queries";
import {
  getBudgetApprovalState,
  listEligibleBudgetApprovers,
} from "@/lib/budget/approval-queries";
import { BudgetApprovalPanel } from "@/components/budget/budget-approval-panel";
import { BudgetAttentionSummary } from "@/components/budget/budget-attention-summary";
import { GuidancePanel } from "@/components/guidance/guidance-panel";
import { WalkMeThrough } from "@/components/guidance/walk-me-through";
import {
  BudgetSection,
  BudgetSectionNav,
} from "@/components/budget/budget-section";
import { buildBudgetAttentionSummary } from "@/lib/budget/attention";
import { toCents } from "@/lib/budget/reconcile-math";
import {
  committedFundingTotal,
  partnerQuoteTotalCents,
} from "@/lib/budget/compute";
import { listEmailDraftsForProject } from "@/lib/email/draft-store";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { listDonationFundingReceiptLinks } from "@/lib/donations/queries";

export const metadata = { title: "Budget" };
export const dynamic = "force-dynamic";

export default async function ProjectBudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ run?: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const session = await requireUser();
  const project = await getProjectHeader(slug);
  if (!project) notFound();
  const workspaceSettings = await getWorkspaceSettings();

  const role = session.user.role as string;
  const allHistory = query.run === "all";
  const canEdit = can(role, "budget.edit") && !allHistory;
  const printRuns = await listPrintRuns(project.id);
  // Only reprints get a run-scoped budget; a first-print run's funding lives in
  // the project total, so it is never offered as a separate scope (which would
  // otherwise show a confusing empty "No quotation yet" view).
  const reprintRuns = printRuns.filter((run) => run.kind === "reprint");
  const requestedRun =
    typeof query.run === "string" &&
    query.run !== "all" &&
    query.run !== "main"
      ? query.run
      : null;
  const activeReprint =
    reprintRuns.find(
      (run) => run.status !== "completed" && run.status !== "cancelled"
    ) ?? null;
  const selectedRun =
    requestedRun
      ? reprintRuns.find((run) => run.id === requestedRun) ?? null
      : query.run === "all" || query.run === "main"
        ? null
        : activeReprint;
  const selectedRunId = selectedRun?.id;
  const scoped = Boolean(selectedRunId);
  const emailDrafts = canEdit
    ? await listEmailDraftsForProject(session.user.id, project.id)
    : [];
  const proposalDraftContextId = selectedRunId ?? project.id;
  const proposalEmailDraft =
    emailDrafts.find(
      (draft) =>
        draft.kind === "funding_proposal" &&
        draft.contextId === proposalDraftContextId
    ) ?? null;
  const invoiceEmailDrafts = emailDrafts.filter(
    (draft) => draft.kind === "mou_invoice"
  );

  // Manager-only operational context; members don't pay the fetch cost.
  const [aiSpend, reconciliation, sharedMouGroups] = canEdit
    ? await Promise.all([
        scoped ? null : getProjectAiSpend(project.id),
        scoped ? null : getBudgetReconciliation(project.id),
        scoped ? [] : listSharedMouGroupsForProject(project.id),
      ])
    : [null, null, []];

  const [{ settings, items, presentation }, projectPrintSettings] =
    await Promise.all([
      getBudgetData(project.id, selectedRunId, allHistory),
      getOrCreatePrintSettings(project.id),
    ]);
  const acceptedPrintQuote = selectedRunId
    ? (await listPrintQuotes(project.id)).find(
        (quote) =>
          quote.runId === selectedRunId && quote.reviewStatus === "accepted"
      ) ?? null
    : null;
  const acceptedPrintQuoteTotal = acceptedPrintQuote
    ? getPrintQuoteTotal(acceptedPrintQuote)?.totalCost ?? null
    : null;
  const proposals = allHistory
    ? []
    : await listProposals(project.id, selectedRunId);
  const partnerDir = canEdit
    ? await listPartnersWithContacts()
    : { partners: [], contacts: [] };
  const partnerOptions = partnerDir.partners.map((p) => ({
    id: p.id,
    name: p.name,
    contacts: partnerDir.contacts
      .filter((c) => c.partnerId === p.id)
      .map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        role: c.role,
        isPrimary: c.isPrimary,
      })),
  }));
  const [
    receipts,
    donationReceiptLinks,
    payments,
    invoices,
    assignees,
    royaltyPayments,
    licenseFeePayments,
    budgetNotes,
    [royalty],
    mentionTargets,
    approvalState,
    eligibleApprovers,
    [rightsCompletion],
  ] = await Promise.all([
    listReceipts(project.id, selectedRunId, allHistory),
    listDonationFundingReceiptLinks(project.id),
    listPayments(project.id, selectedRunId, allHistory),
    listInvoices(project.id, selectedRunId, allHistory),
    listAssignableUsers(),
    listRoyaltyPayments(project.id),
    listLicenseFeePayments(project.id),
    listProjectSurfaceNotes(project.id, "budget"),
    db
      .select({
        requiresRoyalties: projects.requiresRoyalties,
        royaltyPercentage: projects.royaltyPercentage,
        proposedCompletionDate: projects.proposedCompletionDate,
      })
      .from(projects)
      .where(eq(projects.id, project.id))
      .limit(1),
    listProjectMentionTargets(project.id),
    allHistory
      ? Promise.resolve(null)
      : getBudgetApprovalState(project.id, selectedRunId),
    allHistory || !canEdit
      ? Promise.resolve([])
      : listEligibleBudgetApprovers(session.user.id),
    // The signed agreement's completion deadline, if any — supersedes the
    // project's proposed completion date in proposals.
    db
      .select({ completeByDate: rightsItems.completeByDate })
      .from(rightsItems)
      .where(eq(rightsItems.projectId, project.id))
      .limit(1),
  ]);
  const invoiceFileIds = invoices
    .map((invoice) => invoice.sourceFileId ?? invoice.renderedFileId)
    .filter((id): id is string => Boolean(id));
  const invoiceFiles =
    invoiceFileIds.length > 0
      ? await db
          .select({
            id: files.id,
            originalName: files.originalName,
            mimeType: files.mimeType,
            sizeBytes: files.sizeBytes,
          })
          .from(files)
          .where(inArray(files.id, invoiceFileIds))
      : [];
  const invoiceFileById = new Map(invoiceFiles.map((file) => [file.id, file]));
  // Podcast projects gate their second MoU tranche on published episodes.
  const isPodcast = project.kind === "podcast";
  const episodeMilestone = isPodcast ? PAYMENT_EPISODE_MILESTONE : null;
  const publishedEpisodes = isPodcast
    ? await publishedEpisodeCount(project.id)
    : 0;

  const totalReceived = receipts.reduce((s, r) => s + Number(r.amount), 0);
  const totalAvailable = receipts.reduce(
    (sum, receipt) =>
      sum +
      Number(
        receipt.actualNetAmount ??
          receipt.expectedNetAmount ??
          receipt.amount
      ),
    0
  );
  const mouLinkedReceiptIds = new Set(
    payments
      .map((payment) => payment.receiptId)
      .filter((id): id is string => Boolean(id))
  );
  const donationLinkedReceiptIds = new Set(
    donationReceiptLinks.map((link) => link.receiptId)
  );
  const donationMouMatchByReceipt = new Map<
    string,
    { allocationId: string; paymentId: string; label: string }
  >();
  for (const link of donationReceiptLinks) {
    if (link.mouPaymentId) continue;
    const receipt = receipts.find((item) => item.id === link.receiptId);
    if (!receipt) continue;
    const exactPayments = payments.filter(
      (payment) =>
        !payment.paidAt &&
        Number(payment.amount) === Number(receipt.amount) &&
        payment.currency === receipt.currency
    );
    if (exactPayments.length !== 1) continue;
    const payment = exactPayments[0];
    const triggerLabel =
      {
        on_signing: "On signing",
        on_completion: "On completion",
        on_52_episodes: "Episode milestone",
        custom: "Scheduled payment",
      }[payment.trigger] ?? "Scheduled payment";
    donationMouMatchByReceipt.set(receipt.id, {
      allocationId: link.allocationId,
      paymentId: payment.id,
      label:
        payment.notes?.trim() ||
        `${triggerLabel}${payment.dueDate ? ` · due ${payment.dueDate}` : ""}`,
    });
  }
  const lockedReceiptIds = new Set([
    ...mouLinkedReceiptIds,
    ...donationLinkedReceiptIds,
  ]);
  const receivedContributions = receipts
    .filter((receipt) => !mouLinkedReceiptIds.has(receipt.id))
    .reduce((s, r) => s + Number(r.amount), 0);
  const scheduledFunding = payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );
  const partnerQuoteTotal = presentation
    ? presentation.mode === "per_copy"
      ? (presentation.perCopyQuantity ?? 0) *
        Number(presentation.perCopyUnitPrice ?? 0)
      : partnerQuoteTotalCents(items) / 100
    : items.reduce((sum, item) => sum + Number(item.amount), 0);
  // Imports committed before funded licenses linked their payer to Budget can
  // still show the agreement party immediately. New imports persist this link;
  // this fallback is read-only and only applies when a real receivable exists.
  let budgetSettings = settings;
  if (scheduledFunding > 0 && !settings.partnerName) {
    const [rights] = await db
      .select({
        agreementType: rightsItems.agreementType,
        mouHolderId: rightsItems.mouHolderId,
        mouContactId: rightsItems.mouContactId,
        licenseHolderId: rightsItems.licenseHolderId,
        licenseContactId: rightsItems.licenseContactId,
      })
      .from(rightsItems)
      .where(eq(rightsItems.projectId, project.id))
      .limit(1);
    const holderId =
      rights?.agreementType === "license_only"
        ? rights.licenseHolderId
        : rights?.mouHolderId;
    const contactId =
      rights?.agreementType === "license_only"
        ? rights.licenseContactId
        : rights?.mouContactId;
    const [[holder], [contact]] = await Promise.all([
      holderId
        ? db
            .select({ name: rightsHolders.name })
            .from(rightsHolders)
            .where(eq(rightsHolders.id, holderId))
            .limit(1)
        : Promise.resolve([]),
      contactId
        ? db
            .select({
              name: rightsContacts.name,
              email: rightsContacts.email,
              phone: rightsContacts.phone,
            })
            .from(rightsContacts)
            .where(eq(rightsContacts.id, contactId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    if (holder?.name) {
      const savedPartner = partnerOptions.find(
        (partner) =>
          partner.name.trim().toLowerCase() === holder.name.trim().toLowerCase()
      );
      const savedContact = contact?.email
        ? savedPartner?.contacts.find(
            (candidate) =>
              candidate.email?.trim().toLowerCase() ===
              contact.email?.trim().toLowerCase()
          )
        : savedPartner?.contacts.find((candidate) => candidate.isPrimary) ??
          savedPartner?.contacts[0];
      const contactName = (contact?.name ?? "").split(/\s+/).filter(Boolean);
      budgetSettings = {
        ...settings,
        partnerName: holder.name,
        partnerContactFirstName:
          savedContact?.firstName ?? contactName[0] ?? null,
        partnerContactLastName:
          savedContact?.lastName ??
          (contactName.length > 1 ? contactName.slice(1).join(" ") : null),
        partnerContactEmail: savedContact?.email ?? contact?.email ?? null,
        partnerContact: contact?.phone ?? null,
        partnerId: savedPartner?.id ?? null,
        partnerContactId: savedContact?.id ?? null,
      };
    }
  }
  const invoiceByPayment = new Map(
    invoices
      .filter(
        (invoice) => invoice.mouPaymentId && invoice.status !== "void"
      )
      .map((invoice) => [
        invoice.mouPaymentId,
        {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          recipientEmail: invoice.recipientEmail,
          file:
            invoiceFileById.get(
              invoice.sourceFileId ?? invoice.renderedFileId ?? ""
            ) ?? null,
        },
      ])
  );
  const invoiceHistoryByPayment = new Map<
    string,
    { id: string; invoiceNumber: string; status: string }[]
  >();
  for (const invoice of invoices) {
    if (!invoice.mouPaymentId) continue;
    const history = invoiceHistoryByPayment.get(invoice.mouPaymentId) ?? [];
    history.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
    });
    invoiceHistoryByPayment.set(invoice.mouPaymentId, history);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultApprovalDue = new Date(`${todayIso}T00:00:00Z`);
  defaultApprovalDue.setUTCDate(defaultApprovalDue.getUTCDate() + 7);
  const overdueReceivables = payments.filter(
    (payment) =>
      Boolean(payment.dueDate) &&
      payment.dueDate! < todayIso &&
      !payment.receiptId
  );
  const offQuotationCents = reconciliation
    ? reconciliation.offQuotationCents.royalties +
      reconciliation.offQuotationCents.licenseFees +
      reconciliation.offQuotationCents.print
    : 0;
  const reconciliationIssueCount = reconciliation
    ? reconciliation.mismatches.length + (offQuotationCents > 0 ? 1 : 0)
    : 0;
  const pendingApprovalCount =
    approvalState?.active?.assignments.filter(
      (assignment) => assignment.decision !== "approved"
    ).length ?? 0;
  const attentionSummary = buildBudgetAttentionSummary({
    currency: settings.currency,
    quotationTotalCents: Math.round(partnerQuoteTotal * 100),
    committedFundingCents: Math.round(
      committedFundingTotal(
        items.reduce((sum, item) => sum + Number(item.amountSecured), 0),
        scheduledFunding,
        receivedContributions
      ) * 100
    ),
    approvalStatus: approvalState?.active?.status ?? null,
    pendingApprovalCount,
    overdueReceivableCount: overdueReceivables.length,
    overdueReceivableCents: overdueReceivables.reduce(
      (sum, payment) => sum + toCents(payment.amount),
      0
    ),
    reconciliationIssueCount,
  });
  const displayedAttentionSummary =
    scoped && items.length === 0
      ? {
          ...attentionSummary,
          items: [
            {
              id: "setup" as const,
              severity: "info" as const,
              label: "Reprint budget not set up",
              value:
                acceptedPrintQuote && acceptedPrintQuoteTotal
                  ? "The accepted printer quote is ready to add."
                  : "Add the print cost manually or accept a printer quote first.",
              href: "#reprint-budget-setup" as const,
            },
          ],
          nextAction: {
            label:
              acceptedPrintQuote && acceptedPrintQuoteTotal
                ? "Add accepted print quote"
                : "Add the reprint cost",
            href: "#reprint-budget-setup" as const,
          },
        }
      : attentionSummary;
  const budgetSections = [
    { id: "planning", label: "Planning" },
    ...(!allHistory ? [{ id: "decisions", label: "Decisions" }] : []),
    { id: "cash-reconciliation", label: "Cash & reconciliation" },
    { id: "agreements-fees", label: "Agreements & fees" },
    { id: "operations-notes", label: "AI spend & notes" },
  ];

  return (
    <div className="space-y-5">
      <BudgetScopeNav
        slug={slug}
        runs={reprintRuns.map((run) => ({
          id: run.id,
          title: run.title,
          kind: run.kind,
          printNumber: run.printNumber,
          status: run.status,
        }))}
        selectedRunId={selectedRunId ?? null}
        allHistory={allHistory}
      />
      <BudgetAttentionSummary summary={displayedAttentionSummary} />
      {canEdit && !scoped && !allHistory ? (
        <GuidancePanel
          guidanceKey="budget-whats-next"
          slug="budget"
          heading="Budget in four steps"
          title="New to budgets? Here is the flow"
          action={
            <WalkMeThrough prompt="Please walk me through the budget for this project, step by step. Explain in simple words what I should do next." />
          }
        />
      ) : null}
      <BudgetSectionNav sections={budgetSections} />

      <BudgetSection
        id="planning"
        title="Planning"
        description="Quotation assumptions, line items, funding, and editable totals."
        defaultOpen
      >
        <BudgetManager
          projectId={project.id}
          slug={slug}
          projectKind={project.kind}
          printRunId={selectedRunId ?? null}
          scopeLabel={
            selectedRun
              ? selectedRun.kind === "reprint"
                ? `Reprint ${selectedRun.printNumber ?? ""} budget`.replace("  ", " ")
                : "Print run budget"
              : "Project quotation"
          }
          canEdit={canEdit}
          totalReceived={totalReceived}
          totalAvailable={totalAvailable}
          aggregateReadOnly={allHistory}
          presentation={
            presentation
              ? {
                  mode: presentation.mode,
                  deductionBps: presentation.deductionBps,
                  publicDescription: presentation.publicDescription,
                  perCopyQuantity: presentation.perCopyQuantity,
                  perCopyUnitPrice: presentation.perCopyUnitPrice,
                }
              : null
          }
          settings={{
            wordCount: budgetSettings.wordCount,
            sourcePageCount: budgetSettings.sourcePageCount,
            wordsPerPage: budgetSettings.wordsPerPage,
            languageExpansionFactor:
              projectPrintSettings.languageExpansionFactor,
            currency: budgetSettings.currency,
            rateTranslation: budgetSettings.rateTranslation,
            rateProofreading: budgetSettings.rateProofreading,
            rateEditing: budgetSettings.rateEditing,
            rateCoverDesign: budgetSettings.rateCoverDesign,
            rateTypesetting: budgetSettings.rateTypesetting,
            rateProjectManagement: budgetSettings.rateProjectManagement,
            ratePrintShip: budgetSettings.ratePrintShip,
            rateAudiobook: budgetSettings.rateAudiobook,
            rateVideoSeries: budgetSettings.rateVideoSeries,
            partnerName: budgetSettings.partnerName,
            partnerContactFirstName: budgetSettings.partnerContactFirstName,
            partnerContactLastName: budgetSettings.partnerContactLastName,
            partnerContactEmail: budgetSettings.partnerContactEmail,
            partnerContact: budgetSettings.partnerContact,
            partnerId: budgetSettings.partnerId,
            partnerContactId: budgetSettings.partnerContactId,
            workDescription: budgetSettings.workDescription,
          }}
          partners={partnerOptions}
          items={items.map((i) => ({
            id: i.id,
            group: i.group,
            category: i.category,
            label: i.label,
            partnerLabel: i.partnerLabel,
            partnerUnitPrice: i.partnerUnitPrice,
            partnerVisible: i.partnerVisible,
            unit: i.unit,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            amount: i.amount,
            amountSecured: i.amountSecured,
            amountSpent: i.amountSpent,
            isAutoQuantity: i.isAutoQuantity,
          }))}
          receivedContributions={receivedContributions}
          scheduledFunding={scheduledFunding}
          acceptedPrintQuote={
            acceptedPrintQuote && acceptedPrintQuoteTotal
              ? {
                  id: acceptedPrintQuote.id,
                  label: `Reprint ${
                    selectedRun?.printNumber ?? ""
                  } print / ship`.replace("  ", " "),
                  total: acceptedPrintQuoteTotal,
                  currency: acceptedPrintQuote.currency,
                  quantity: acceptedPrintQuote.quantityCps,
                }
              : null
          }
        />
      </BudgetSection>

      {!allHistory ? (
        <BudgetSection
          id="decisions"
          title="Decisions and approvals"
          description="Approval state and proposal history before anything is sent."
        >
          <BudgetApprovalPanel
            projectId={project.id}
            printRunId={selectedRunId ?? null}
            canManage={canEdit}
            currentUserId={session.user.id}
            todayIso={todayIso}
            defaultDueDate={defaultApprovalDue.toISOString().slice(0, 10)}
            eligibleApprovers={eligibleApprovers}
            active={
              approvalState?.active
                ? {
                    ...approvalState.active,
                    approvedAt:
                      approvalState.active.approvedAt?.toISOString() ?? null,
                    supersededAt:
                      approvalState.active.supersededAt?.toISOString() ?? null,
                    createdAt: approvalState.active.createdAt.toISOString(),
                    assignments: approvalState.active.assignments.map(
                      (assignment) => ({
                        ...assignment,
                        decidedAt: assignment.decidedAt?.toISOString() ?? null,
                      })
                    ),
                  }
                : null
            }
            history={
              approvalState?.history.map((round) => ({
                ...round,
                approvedAt: round.approvedAt?.toISOString() ?? null,
                supersededAt: round.supersededAt?.toISOString() ?? null,
                createdAt: round.createdAt.toISOString(),
                assignments: round.assignments.map((assignment) => ({
                  ...assignment,
                  decidedAt: assignment.decidedAt?.toISOString() ?? null,
                })),
              })) ?? []
            }
            synchronizedAfterChange={
              approvalState?.synchronizedAfterChange ?? false
            }
          />
          <ProposalPanel
            projectId={project.id}
            projectSlug={slug}
            printRunId={selectedRunId ?? null}
            partnerQuoteMode={presentation?.mode ?? null}
            partnerQuoteTotal={partnerQuoteTotal}
            currency={settings.currency}
            canEdit={canEdit}
            fundingEmail={budgetSettings.partnerContactEmail}
            approvalRequired={approvalState?.approvalRequired ?? false}
            approvalCanSend={approvalState?.canSend ?? false}
            approvalGateReason={approvalState?.gateReason ?? null}
            proposedCompletionDate={royalty?.proposedCompletionDate ?? null}
            realCompletionDeadline={rightsCompletion?.completeByDate ?? null}
            initialEmailDraft={proposalEmailDraft}
            proposals={proposals.map((p) => ({
              id: p.id,
              recipientName: p.recipientName,
              recipientEmail: p.recipientEmail,
              subject: p.subject,
              currency: p.currency,
              totalAmount: p.totalAmount,
              budgetApprovalRequestId: p.budgetApprovalRequestId,
              fileId: p.fileId,
              status: p.status,
              sentAt: p.sentAt.toISOString(),
              sentByName: p.sentByName,
            }))}
          />
        </BudgetSection>
      ) : null}

      <BudgetSection
        id="cash-reconciliation"
        title="Cash and reconciliation"
        description="Receipts, cash flow, and differences between recorded and manual spend."
      >
        {reconciliation ? (
          <ReconciliationPanel
            mismatches={reconciliation.mismatches}
            offQuotation={reconciliation.offQuotationCents}
            currency={settings.currency}
          />
        ) : null}
        {reconciliation ? (
          <CashflowCard
            cashflow={reconciliation.cashflow}
            totals={reconciliation.totals}
            currency={settings.currency}
          />
        ) : null}
        <FundingReceipts
          projectId={project.id}
          printRunId={selectedRunId ?? null}
          currency={settings.currency}
          canEdit={canEdit}
          canReconcileDonation={can(role, "donations.manage") && !allHistory}
          receipts={receipts.map((r) => ({
            id: r.id,
            printRunId: r.printRunId,
            amount: r.amount,
            deductionBps: r.deductionBps,
            expectedNetAmount: r.expectedNetAmount,
            actualNetAmount: r.actualNetAmount,
            currency: r.currency,
            receivedDate: r.receivedDate,
            source: r.source,
            note: r.note,
            locked: lockedReceiptIds.has(r.id),
            lockLabel: donationLinkedReceiptIds.has(r.id)
              ? ("Donation" as const)
              : mouLinkedReceiptIds.has(r.id)
                ? ("MoU" as const)
                : undefined,
            mouMatch: donationMouMatchByReceipt.get(r.id),
          }))}
        />
      </BudgetSection>

      <BudgetSection
        id="agreements-fees"
        title="Agreements and fees"
        description="Scheduled funding, royalties, license fees, and shared agreement allocations."
      >
        {sharedMouGroups.map((group) => (
          <Link
            key={group.id}
            href={`/agreements/${group.id}`}
            className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-start gap-2">
              <Layers3 className="mt-0.5 size-4 shrink-0 text-info" />
              <span>
                This project receives an allocated share from <strong>{group.name}</strong>.
                The shared payment schedule is managed on the agreement.
                {group.schedule.map((payment) => <span key={payment.id} className="mt-1 block text-xs">
                  {payment.trigger.replaceAll("_", " ")} · {group.currency} {payment.amount} · {payment.readinessReason ?? "Awaiting evaluation"}
                </span>)}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: group.currency,
              }).format(Number(group.allocationAmount))}
            </span>
          </Link>
        ))}
        <MouPayments
          hasSharedSchedule={sharedMouGroups.length > 0}
          projectId={project.id}
          printRunId={selectedRunId ?? null}
          currency={settings.currency}
          canEdit={canEdit}
          assignees={assignees}
          projectStatus={project.status}
          publishedEpisodeCount={publishedEpisodes}
          episodeMilestone={episodeMilestone}
          deductionBps={presentation?.deductionBps ?? 0}
          fundingTarget={partnerQuoteTotal}
          defaultCcEmails={workspaceSettings.defaultCcEmails}
          initialEmailDrafts={invoiceEmailDrafts}
          payments={payments.map((p) => ({
            id: p.id,
            printRunId: p.printRunId,
            amount: p.amount,
            currency: p.currency,
            trigger: p.trigger,
            dueDate: p.dueDate,
            notes: p.notes,
            publicDescription: p.publicDescription,
            invoiceAssigneeId: p.invoiceAssigneeId,
            invoiceTaskId: p.invoiceTaskId,
            invoiceRequestedAt: p.invoiceRequestedAt,
            paidAt: p.paidAt,
            invoice: invoiceByPayment.get(p.id) ?? null,
            invoiceHistory: invoiceHistoryByPayment.get(p.id) ?? [],
          }))}
        />
        {!scoped ? (
          <>
          <RoyaltiesCard
            projectId={project.id}
            canEdit={canEdit}
            requiresRoyalties={royalty?.requiresRoyalties ?? false}
            royaltyPercentage={royalty?.royaltyPercentage ?? null}
            royaltyRecipientEmail={settings.royaltyRecipientEmail}
            royaltyDueMonth={settings.royaltyDueMonth}
            royaltyDueDay={settings.royaltyDueDay}
            royaltyTaskAssigneeId={settings.royaltyTaskAssigneeId}
            royaltyFrequency={settings.royaltyFrequency}
            royaltyAmount={settings.royaltyAmount}
            royaltyCurrency={settings.royaltyCurrency}
            projectCurrency={settings.currency}
            assignees={assignees}
          />
          <RoyaltyPayments
            slug={slug}
            canEdit={canEdit}
            payments={royaltyPayments.map((p) => ({
              id: p.id,
              period: p.period,
              amount: p.amount,
              currency: p.currency,
              dueDate: p.dueDate,
              assigneeName: p.assigneeName,
              taskId: p.taskId,
              paidAt: p.paidAt,
            }))}
          />
          <LicenseFeePayments
            slug={slug}
            canEdit={canEdit}
            heading
            sourceHref={`/projects/${slug}/rights`}
            payments={licenseFeePayments.map((p) => ({
              id: p.id,
              period: p.period,
              amount: p.amount,
              currency: p.currency,
              dueDate: p.dueDate,
              assigneeName: p.assigneeName,
              taskId: p.taskId,
              paidAt: p.paidAt,
              receipts: p.receipts,
            }))}
          />
          </>
        ) : null}
      </BudgetSection>

      <BudgetSection
        id="operations-notes"
        title="AI spend and notes"
        description="Operational AI cost and the project team's budget discussion."
      >
        {aiSpend && aiSpend.requests > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="font-medium">AI spend on this project:</span>
            <span className="tabular-nums">
              ${aiSpend.allTimeUsd.toFixed(2)} all time
              {aiSpend.monthUsd > 0
                ? ` · $${aiSpend.monthUsd.toFixed(2)} this month`
                : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              ({aiSpend.requests} calls — operational cost, not part of the quotation)
            </span>
          </div>
        ) : null}
        <ProjectSurfaceNotes
          projectId={project.id}
          slug={slug}
          surface="budget"
          title="Budget notes"
          emptyText="No budget notes yet."
          currentUserId={session.user.id}
          canModerate={canEdit}
          members={mentionTargets}
          notes={budgetNotes.map((note) => ({
            id: note.id,
            userId: note.userId,
            authorName: note.authorName,
            body: note.body,
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
            replies: note.replies.map((reply) => ({
              id: reply.id,
              userId: reply.userId,
              authorName: reply.authorName,
              body: reply.body,
              createdAt: reply.createdAt.toISOString(),
              updatedAt: reply.updatedAt.toISOString(),
            })),
          }))}
        />
      </BudgetSection>
    </div>
  );
}

function BudgetScopeNav({
  slug,
  runs,
  selectedRunId,
  allHistory,
}: {
  slug: string;
  runs: {
    id: string;
    title: string;
    kind: string;
    printNumber: number | null;
    status: string;
  }[];
  selectedRunId: string | null;
  allHistory: boolean;
}) {
  if (runs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Budget scope</p>
        <p className="text-xs text-muted-foreground">
          Main and reprint budgets stay separate. All history is read-only.
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <Link
          href={`/projects/${slug}/budget?run=main`}
          className={cn(
            buttonVariants({
              variant: !selectedRunId && !allHistory ? "default" : "outline",
              size: "sm",
            })
          )}
        >
          Main project
        </Link>
        {runs.map((run) => (
          <Link
            key={run.id}
            href={`/projects/${slug}/budget?run=${run.id}`}
            className={cn(
              buttonVariants({
                variant: selectedRunId === run.id ? "default" : "outline",
                size: "sm",
              }),
              "max-w-full"
            )}
          >
            <span className="truncate">
              {run.kind === "reprint"
                ? `Reprint ${run.printNumber ?? ""}`.trim()
                : run.title}
            </span>
            {run.kind === "reprint" && run.status !== "completed" ? (
              <Badge variant="secondary" className="ml-1">
                {run.status.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </Link>
        ))}
        <Link
          href={`/projects/${slug}/budget?run=all`}
          className={cn(
            buttonVariants({
              variant: allHistory ? "default" : "outline",
              size: "sm",
            })
          )}
        >
          All history
        </Link>
      </div>
    </div>
  );
}
