import { PartnerQuotationsPanel } from "@/components/budget/partner-quotations-panel";
import { listPartnerQuotations } from "@/lib/budget/partner-quotation-queries";
import { budgetApprovalFingerprint } from "@/lib/budget/approval-fingerprint";
import { PrintEstimateSection } from "@/components/print/print-estimate-section";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  projects,
  files,
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
  getPartnerPrintCandidates,
  listInvoices,
  listPayments,
  listReceipts,
  listRoyaltyPayments,
} from "@/lib/budget/queries";
import { partnerQuotePrices } from "@/lib/budget/print-options";
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
import { agendaToday } from "@/lib/agenda/queries";
import { FundingPathPanel } from "@/components/budget/funding-path-panel";
import {
  buildFundingPath,
  fundingPathAttention,
  openDonationPromiseCents,
  PROPOSAL_ANSWER_LABELS,
  proposalAnswer,
} from "@/lib/budget/funding-path";
import { listPartnersWithContacts } from "@/lib/partners/queries";
import { resolveAgreementFundingPartner } from "@/lib/budget/funding-partner";
import { FundingPartnerNotice } from "@/components/budget/funding-partner-notice";
import { FundingReceipts } from "@/components/budget/funding-receipts";
import { donationMouLinkOptions } from "@/lib/donations/mou-link";
import { MouPayments } from "@/components/budget/mou-payments";
import { BudgetLineInvoice } from "@/components/budget/budget-line-invoice";
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
import { StepList } from "@/components/guidance/step-list";
import { buildBudgetSteps } from "@/lib/budget/steps";
import { WalkMeThrough } from "@/components/guidance/walk-me-through";
import {
  BudgetSection,
  BudgetTabs,
} from "@/components/budget/budget-section";
import { buildBudgetAttentionSummary } from "@/lib/budget/attention";
import { toCents } from "@/lib/budget/reconcile-math";
import {
  committedFundingTotal,
  expectedNetCents,
  receivedContributionsTotal,
} from "@/lib/budget/compute";
import { listEmailDraftsForProject } from "@/lib/email/draft-store";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { listDonationFundingReceiptLinks } from "@/lib/donations/queries";
import { getProjectFundingOverview } from "@/lib/projects/funding-overview-queries";
import { ProjectFundingOverview } from "@/components/projects/project-funding-overview";
import { isOutgoingPaymentTerms } from "@/lib/budget/payment-percentage";

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
  const fundingOverviewPromise = canEdit && !scoped ? getProjectFundingOverview(project.id) : Promise.resolve(null);
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

  const [{ settings, items, presentation }, projectPrintSettings, printCandidates] =
    await Promise.all([
      getBudgetData(project.id, selectedRunId, allHistory),
      getOrCreatePrintSettings(project.id),
      canEdit && project.kind !== "podcast" ? getPartnerPrintCandidates(project.id, selectedRunId) : Promise.resolve([]),
    ]);
  const partnerQuotations = canEdit ? await listPartnerQuotations(project.id, selectedRunId) : [];
  const partnerApprovalStates = canEdit ? await Promise.all(partnerQuotations.map(async quote => ({ id: quote.id, state: await getBudgetApprovalState(project.id, selectedRunId, quote.id) }))) : [];
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
      .select({
        completeByDate: rightsItems.completeByDate,
        mouStatus: rightsItems.mouStatus,
      })
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
  const fundingOverview = await fundingOverviewPromise;
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
  const donationMouLinksByReceipt = new Map(
    donationReceiptLinks.flatMap((link) => {
      if (link.mouPaymentId || link.invoiceId || link.sharedMouGroupId || mouLinkedReceiptIds.has(link.receiptId)) return [];
      const receipt = receipts.find((item) => item.id === link.receiptId);
      if (!receipt || Number(receipt.amount) <= 0) return [];
      const options = donationMouLinkOptions(receipt, payments);
      return options.length ? [[receipt.id, { allocationId: link.allocationId, options }] as const] : [];
    })
  );
  const lockedReceiptIds = new Set([
    ...mouLinkedReceiptIds,
    ...donationLinkedReceiptIds,
  ]);
  const receivedContributions = receivedContributionsTotal(receipts, payments);
  const scheduledFunding = payments.filter(payment => !isOutgoingPaymentTerms(payment.notes)).reduce(
    (sum, payment) => sum + Number(payment.amount),
    0
  );
  // Funding path: each sent proposal, the partner's answer, and its money.
  const paymentReceiptIds = new Set(
    payments.flatMap((payment) => (payment.receiptId ? [payment.receiptId] : []))
  );
  const fundingProposals = proposals.map((proposal) => ({
    id: proposal.id,
    partnerLabel:
      proposal.partnerName?.trim() ||
      proposal.recipientName?.trim() ||
      proposal.recipientEmail,
    recipientEmail: proposal.recipientEmail,
    scopeLabel:
      partnerQuotations.find((quote) => quote.id === proposal.partnerQuotationId)
        ?.title ?? null,
    currency: proposal.currency,
    totalAmount: proposal.totalAmount,
    status: proposal.status,
    fundingPath: proposal.fundingPath,
    agreedAmount: proposal.agreedAmount,
    answeredOn: proposal.answeredOn,
    answerNote: proposal.answerNote,
    sentAt: proposal.sentAt.toISOString(),
  }));
  const fundingPathInput = {
    proposals: fundingProposals,
    payments: payments.map((payment) => ({
      id: payment.id,
      proposalId: payment.proposalId,
      amount: payment.amount,
      paidAt: payment.paidAt,
      receiptId: payment.receiptId,
    })),
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      proposalId: receipt.proposalId,
      amount: receipt.amount,
    })),
  };
  const fundingAttention = fundingPathAttention(buildFundingPath(fundingPathInput));
  // Promised money = expected payments plus donations a partner promised but
  // has not given yet. Both count as committed funding.
  const promisedFunding =
    scheduledFunding + openDonationPromiseCents(fundingPathInput) / 100;
  const proposalOptions = fundingProposals.map((proposal) => ({
    id: proposal.id,
    label: `${proposal.partnerLabel} · ${new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: proposal.currency,
    }).format(Number(proposal.totalAmount))} · ${
      PROPOSAL_ANSWER_LABELS[proposalAnswer(proposal)]
    }`,
    fundingPath: proposal.fundingPath,
  }));
  const partnerQuoteTotal = presentation
    ? presentation.mode === "per_copy"
      ? (presentation.perCopyQuantity ?? 0) *
        Number(presentation.perCopyUnitPrice ?? 0)
      : partnerQuotePrices(items, presentation.printOptions).minimumCents / 100
    : items.reduce((sum, item) => sum + Number(item.amount), 0);
  // Imports committed before funded licenses linked their payer to Budget can
  // still show the agreement party immediately. New imports persist this link;
  // this fallback is read-only and only applies when a real receivable exists.
  let budgetSettings = settings;
  // Where the partner shown on this page comes from: saved on Budget, read from
  // the signed agreement (not saved yet), or not known at all.
  let fundingPartnerSource: "saved" | "agreement" | "none" = settings.partnerName?.trim() ? "saved" : "none";
  if (promisedFunding > 0 && !settings.partnerName?.trim()) {
    const agreementPartner = await resolveAgreementFundingPartner(project.id, partnerDir);
    if (agreementPartner) {
      fundingPartnerSource = "agreement";
      budgetSettings = {
        ...settings,
        partnerName: agreementPartner.partnerName,
        partnerContactFirstName: agreementPartner.partnerContactFirstName,
        partnerContactLastName: agreementPartner.partnerContactLastName,
        partnerContactEmail: agreementPartner.partnerContactEmail,
        partnerContact: agreementPartner.partnerContact,
        partnerId: agreementPartner.partnerId,
        partnerContactId: agreementPartner.partnerContactId,
      };
    }
  }
  const fundingPartnerSummary = {
    source: fundingPartnerSource,
    name: budgetSettings.partnerName?.trim() || null,
    contactName:
      [budgetSettings.partnerContactFirstName, budgetSettings.partnerContactLastName]
        .filter(Boolean)
        .join(" ") || null,
    email: budgetSettings.partnerContactEmail?.trim() || null,
  };
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
          recipientName: invoice.recipientName,
          recipientEmail: invoice.recipientEmail,
          description: invoice.description,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          status: invoice.status,
          generated: !invoice.sourceFileId,
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
      !payment.receiptId && !payment.paidAt && Number(payment.amount) > 0 && !isOutgoingPaymentTerms(payment.notes)
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
  const committedTotal = committedFundingTotal(items.reduce((sum, item) => sum + Number(item.amountSecured), 0), promisedFunding, receivedContributions);
  const attentionSummary = buildBudgetAttentionSummary({
    currency: settings.currency,
    quotationTotalCents: Math.round(partnerQuoteTotal * 100),
    committedFundingCents: Math.round(committedTotal * 100),
    fundingReviewCount: fundingOverview?.balances.filter(balance => balance.needsReview).length ?? 0,
    proposalsWaitingCount: fundingAttention.waitingCount,
    oldestProposalWaitingDays: fundingAttention.oldestWaitingDays,
    agreedWithoutPaymentsCount: fundingAttention.agreedWithoutPaymentsCount,
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
  // Budget steps: where this project is on the path from costs to funding.
  const costCents = items.reduce((sum, item) => sum + toCents(item.amount), 0);
  const partnerQuoteCents = Math.round(partnerQuoteTotal * 100);
  const budgetSteps =
    canEdit && !scoped && !allHistory
      ? buildBudgetSteps({
          currency: settings.currency,
          printing:
            project.kind === "podcast" || project.kind === "video_series"
              ? "none"
              : project.kind === "book"
                ? "expected"
                : "optional",
          wordCount: budgetSettings.wordCount,
          sourcePageCount: budgetSettings.sourcePageCount,
          items,
          hasPartnerQuote: Boolean(presentation),
          partnerQuoteCents,
          coverageCents:
            presentation &&
            !(presentation.mode === "itemized" && presentation.printOptions.length)
              ? expectedNetCents(partnerQuoteCents, presentation.deductionBps) -
                costCents
              : null,
          approval: {
            required: approvalState?.approvalRequired ?? false,
            status: approvalState?.active?.status ?? null,
            canSend: approvalState?.canSend ?? false,
          },
          unsentQuotationCount: partnerQuotations.filter(
            (quote) =>
              !proposals.some((proposal) => proposal.partnerQuotationId === quote.id)
          ).length,
          sentProposalCount: proposals.length,
          waitingCount: fundingAttention.waitingCount,
          oldestWaitingDays: fundingAttention.oldestWaitingDays,
          agreedWithoutPaymentsCount: fundingAttention.agreedWithoutPaymentsCount,
          hasFunding: payments.length > 0 || receipts.length > 0,
          printHref: `/projects/${slug}/print`,
        })
      : null;
  const budgetIsEmpty = items.every((item) => item.category === "print_ship");
  const printEstimate =
    canEdit && !scoped && !allHistory && project.kind !== "podcast" ? (
      <PrintEstimateSection projectId={project.id} userId={session.user.id} />
    ) : null;
  const budgetSections = [
    { id: "planning", label: "Quotation" },
    ...(canEdit ? [{ id: "partner-proposals", label: "Partners & proposals", attentionCount: partnerApprovalStates.reduce((sum, { state }) => sum + (state.active?.assignments.filter(a => a.decision !== "approved").length ?? 0), 0) + fundingAttention.agreedWithoutPaymentsCount }] : []),
    ...(!allHistory ? [{ id: "decisions", label: "Approvals", attentionCount: pendingApprovalCount }] : []),
    { id: "cash-reconciliation", label: "Cash flow", attentionCount: overdueReceivables.length + reconciliationIssueCount },
    { id: "agreements-fees", label: "Payments" },
    { id: "operations-notes", label: "Notes" },
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3">
      <h2 className="text-lg font-semibold">Budget</h2>
      {budgetSteps ? (
        <StepList
          guidanceKey="budget-whats-next"
          className="col-span-2"
          collapsedClassName="col-span-1 col-start-2 row-start-1"
          title="Budget steps"
          doneMessage="All budget steps are done."
          guide={budgetSteps}
          footer={
            <>
              <WalkMeThrough
                variant="ghost"
                prompt="Please walk me through the budget for this project, step by step. Explain in simple words what I should do next."
              />
              <Link
                href="/help/budget"
                className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
              >
                Learn more
              </Link>
            </>
          }
        />
      ) : null}
      </div>
      {fundingOverview ? <ProjectFundingOverview funding={fundingOverview} slug={slug} view="summary" title="Funding summary" id="budget-funding" quotation={{ totalCents: Math.round(partnerQuoteTotal * 100), currency: settings.currency }} /> : <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border bg-card px-4 py-3" aria-label="Budget summary">
        {[{ label: presentation?.mode === "itemized" && presentation.printOptions.length ? "Partner quotation from" : "Partner quotation", value: partnerQuoteTotal }, { label: "Committed funding", value: committedTotal }, { label: "Funding gap", value: Math.max(0, partnerQuoteTotal - committedTotal) }].map(item => <div key={item.label}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="text-base font-semibold tabular-nums">{new Intl.NumberFormat(undefined, { style: "currency", currency: settings.currency }).format(item.value)}</dd></div>)}
      </dl>}
      <BudgetAttentionSummary summary={displayedAttentionSummary} />
      <BudgetTabs sections={budgetSections}>

      <BudgetSection
        id="planning"
        title="Quotation"
        description="Quotation assumptions, line items, funding, and editable totals."
      >
        {/* An empty budget shows guided setup first; the printer estimate follows it. */}
        {printEstimate && !budgetIsEmpty ? printEstimate : null}
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
          printCandidates={printCandidates}
          presentation={
            presentation
              ? {
                  mode: presentation.mode,
                  printOptions: presentation.printOptions,
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
          scheduledFunding={promisedFunding}
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
        {printEstimate && budgetIsEmpty ? printEstimate : null}
      </BudgetSection>

      {!allHistory ? (
        <BudgetSection
          id="decisions"
          title="Approvals"
          summary={pendingApprovalCount ? `${pendingApprovalCount} pending` : undefined}
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

        </BudgetSection>
      ) : null}

      {canEdit ? <BudgetSection id="partner-proposals" title="Partners & proposals" description="One project budget. A separate quotation and proposal for each partner. Record each partner’s answer here.">
        {!scoped ? <FundingPartnerNotice projectId={project.id} partner={fundingPartnerSummary} purpose="proposals" /> : null}
        <FundingPathPanel
          projectSlug={slug}
          todayIso={agendaToday(new Date(), workspaceSettings.timezone)}
          canEdit={canEdit}
          proposals={fundingProposals}
          payments={fundingPathInput.payments}
          receipts={receipts.map((receipt) => ({
            id: receipt.id,
            proposalId: receipt.proposalId,
            amount: receipt.amount,
            currency: receipt.currency,
            source: receipt.source,
            receivedDate: receipt.receivedDate,
            onExpectedPayment: paymentReceiptIds.has(receipt.id),
          }))}
        />
        <PartnerQuotationsPanel
          projectId={project.id}
          projectSlug={slug}
          printRunId={selectedRunId ?? null}
          quotations={partnerQuotations}
          items={items}
          currency={settings.currency}
          sourceFingerprint={budgetApprovalFingerprint(settings, items, presentation)}
          partners={partnerOptions}
          printOptions={
            presentation?.mode === "itemized" ? (presentation.printOptions ?? []) : []
          }
          approvalContext={{
            currentUserId: session.user.id,
            eligibleApprovers,
            todayIso,
            defaultDueDate: defaultApprovalDue.toISOString().slice(0, 10),
          }}
          approvalStates={Object.fromEntries(
            partnerApprovalStates.map(({ id, state }) => [
              id,
              {
                ...state,
                active: state.active
                  ? {
                      ...state.active,
                      approvedAt: state.active.approvedAt?.toISOString() ?? null,
                      supersededAt: state.active.supersededAt?.toISOString() ?? null,
                      createdAt: state.active.createdAt.toISOString(),
                      assignments: state.active.assignments.map((a) => ({
                        ...a,
                        decidedAt: a.decidedAt?.toISOString() ?? null,
                      })),
                    }
                  : null,
                history: state.history.map((round) => ({
                  ...round,
                  approvedAt: round.approvedAt?.toISOString() ?? null,
                  supersededAt: round.supersededAt?.toISOString() ?? null,
                  createdAt: round.createdAt.toISOString(),
                  assignments: round.assignments.map((a) => ({
                    ...a,
                    decidedAt: a.decidedAt?.toISOString() ?? null,
                  })),
                })),
              },
            ]),
          )}
          proposals={proposals.map((p) => ({ ...p, sentAt: p.sentAt.toISOString() }))}
          emailDrafts={emailDrafts}
          approvalRequired={approvalState?.approvalRequired ?? false}
          approvalCanSend={approvalState?.canSend ?? false}
          approvalGateReason={approvalState?.gateReason ?? null}
          proposedCompletionDate={royalty?.proposedCompletionDate ?? null}
          realCompletionDeadline={rightsCompletion?.completeByDate ?? null}
          defaultPartner={
            budgetSettings.partnerName
              ? {
                  partnerId: budgetSettings.partnerId ?? null,
                  partnerName: budgetSettings.partnerName,
                  contactName: [
                    budgetSettings.partnerContactFirstName,
                    budgetSettings.partnerContactLastName,
                  ]
                    .filter(Boolean)
                    .join(" "),
                  contactEmail: budgetSettings.partnerContactEmail ?? "",
                }
              : null
          }
        />
        {partnerQuotations.length === 0 || proposals.some(p => !p.partnerQuotationId) ? <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Original full-project proposal and history</summary><p className="my-3 text-sm text-muted-foreground">Uses the default partner in Quotation settings and the full project quotation.</p>
          <ProposalPanel
            projectId={project.id}
            projectSlug={slug}
            printRunId={selectedRunId ?? null}
            partnerQuoteMode={presentation?.mode ?? null}
            partnerQuoteTotal={partnerQuoteTotal}
            hasPrintOptions={presentation?.mode === "itemized" && Boolean(presentation.printOptions.length)}
            currency={settings.currency}
            canEdit={canEdit && partnerQuotations.length === 0}
            fundingEmail={budgetSettings.partnerContactEmail}
            approvalRequired={approvalState?.approvalRequired ?? false}
            approvalCanSend={approvalState?.canSend ?? false}
            approvalGateReason={approvalState?.gateReason ?? null}
            proposedCompletionDate={royalty?.proposedCompletionDate ?? null}
            realCompletionDeadline={rightsCompletion?.completeByDate ?? null}
            initialEmailDraft={proposalEmailDraft}
            proposals={proposals.filter(p => !p.partnerQuotationId).map((p) => ({
              id: p.id,
              recipientName: p.recipientName,
              recipientEmail: p.recipientEmail,
              subject: p.subject,
              currency: p.currency,
              totalAmount: p.totalAmount,
              budgetApprovalRequestId: p.budgetApprovalRequestId,
              fileId: p.fileId,
              status: p.status,
              fundingPath: p.fundingPath,
              sentAt: p.sentAt.toISOString(),
              sentByName: p.sentByName,
            }))}
          />
        </details> : null}
        {proposals.some(p => !p.partnerQuotationId) && partnerQuotations.length > 0 ? <p className="text-xs text-muted-foreground">Earlier proposals remain in the original proposal history, including deleted partner quotations.</p> : null}
      </BudgetSection> : null}

      <BudgetSection
        id="cash-reconciliation"
        title="Cash flow"
        summary={overdueReceivables.length || reconciliationIssueCount ? `${overdueReceivables.length} overdue · ${reconciliationIssueCount} issues` : undefined}
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
                ? ("Expected payment" as const)
                : undefined,
            proposalId: r.proposalId,
            mouLink: donationMouLinksByReceipt.get(r.id),
            mouPaymentLabel: payments.find((payment) => payment.receiptId === r.id)?.notes ||
              (mouLinkedReceiptIds.has(r.id) ? "Expected payment" : undefined),
          }))}
          proposals={canEdit ? proposalOptions : []}
        />
      </BudgetSection>

      <BudgetSection
        id="agreements-fees"
        title="Payments"
        description="Expected payments from partners, royalties, license fees, and shared agreement allocations."
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
        {canEdit && !scoped && (payments.some((payment) => !payment.sharedMouGroupId) || fundingPartnerSummary.source !== "none") ? (
          <FundingPartnerNotice projectId={project.id} partner={fundingPartnerSummary} purpose="invoices" />
        ) : null}
        {canEdit ? (
          <BudgetLineInvoice
            projectId={project.id}
            printRunId={selectedRunId ?? null}
            currency={settings.currency}
            partnerName={budgetSettings.partnerName}
            partnerEmail={budgetSettings.partnerContactEmail}
            lines={items.filter((item) => item.partnerVisible).map((item) => ({
              id: item.id,
              label: item.partnerLabel?.trim() || item.label,
              quantity: item.quantity,
              unitPrice: item.partnerUnitPrice ?? item.unitPrice,
              alreadyInvoiced: payments.some((payment) =>
                payment.budgetInvoice?.budgetItemIds.includes(item.id) && invoiceByPayment.has(payment.id)
              ),
            }))}
          />
        ) : null}
        <MouPayments
          hasSharedSchedule={sharedMouGroups.length > 0}
          projectId={project.id}
          projectTitle={project.title}
          emailIdentity={{ senderName: session.user.name?.trim() || "Sastra team", organizationName: workspaceSettings.orgName?.trim() || "Sastra workspace" }}
          printRunId={selectedRunId ?? null}
          currency={settings.currency}
          canEdit={canEdit}
          assignees={assignees}
          projectStatus={project.status}
          publishedEpisodeCount={publishedEpisodes}
          episodeMilestone={episodeMilestone}
          deductionBps={presentation?.deductionBps ?? 0}
          fundingTarget={partnerQuoteTotal}
          rightsHref={`/projects/${slug}/rights`}
          unlinkedReceivedAmount={receipts
            .filter((receipt) => receipt.currency === settings.currency && !payments.some((payment) => payment.receiptId === receipt.id))
            .reduce((sum, receipt) => sum + Number(receipt.amount), 0)}
          defaultCcEmails={workspaceSettings.defaultCcEmails}
          initialEmailDrafts={invoiceEmailDrafts}
          proposals={proposalOptions}
          fundingPartner={{ name: fundingPartnerSummary.name, email: fundingPartnerSummary.email }}
          defaultBasis={
            !rightsCompletion || rightsCompletion.mouStatus === "not_needed"
              ? "no_mou"
              : "mou"
          }
          payments={payments.map((p) => ({
            id: p.id,
            printRunId: p.printRunId,
            amount: p.amount,
            currency: p.currency,
            trigger: p.trigger,
            fundingBasis: p.fundingBasis,
            partnerName: p.partnerName,
            proposalId: p.proposalId,
            dueDate: p.dueDate,
            notes: p.notes,
            publicDescription: p.publicDescription,
            invoiceAssigneeId: p.invoiceAssigneeId,
            invoiceTaskId: p.invoiceTaskId,
            invoiceRequestedAt: p.invoiceRequestedAt,
            paidAt: p.paidAt,
            receivedAmount: receipts.find((receipt) => receipt.id === p.receiptId)?.amount ?? null,
            donationLinked: p.receiptId ? donationLinkedReceiptIds.has(p.receiptId) : false,
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
        title="Notes"
        description="Budget discussion and AI operating costs, separate from the quotation."
      >
        {aiSpend && aiSpend.requests > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <Sparkles className="size-4 text-muted-foreground" />
            <span className="font-medium">AI operating cost:</span>
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
      </BudgetTabs>
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
