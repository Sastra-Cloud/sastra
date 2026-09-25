import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { getProjectHeader } from "@/lib/projects/queries";
import { getPrintData } from "@/lib/print/queries";
import { listAttachmentsByTargets } from "@/lib/files/queries";
import { PrintManager } from "@/components/print/print-manager";
import { GuidancePanel } from "@/components/guidance/guidance-panel";
import { WalkMeThrough } from "@/components/guidance/walk-me-through";
import { listEmailDraftsForProject } from "@/lib/email/draft-store";

export const metadata = { title: "Print" };
export const dynamic = "force-dynamic";

export default async function ProjectPrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireUser();
  const project = await getProjectHeader(slug);
  if (!project) notFound();

  const role = session.user.role as string;
  const canEdit = can(role, "print.manage");
  const data = await getPrintData(project.id);
  const quoteIds = data.quotes.map((quote) => quote.id);
  const paymentIds = data.payments.map((payment) => payment.id);
  const [quoteAttachments, paymentAttachments, emailDrafts] = await Promise.all([
    listAttachmentsByTargets("print_quote", quoteIds),
    listAttachmentsByTargets("print_payment", paymentIds),
    canEdit
      ? listEmailDraftsForProject(session.user.id, project.id)
      : Promise.resolve([]),
  ]);

  const toAttachmentObject = (map: Awaited<typeof quoteAttachments>) =>
    Object.fromEntries([...map.entries()]);

  return (
    <div className="space-y-5">
      {canEdit ? (
        <GuidancePanel
          guidanceKey="print-whats-next"
          slug="print"
          heading="Printing in five steps"
          title="New to printing? Here is the flow"
          action={
            <WalkMeThrough prompt="Please walk me through printing this book, step by step. Explain in simple words what I should do next." />
          }
        />
      ) : null}
      <PrintManager
      key={`${data.sourcePageCount ?? 0}:${data.settings.trimWidthIn}:${data.settings.trimHeightIn}:${data.settings.measurementUnit}:${data.settings.languageExpansionFactor}`}
      projectId={project.id}
      projectSlug={project.slug}
      projectTitle={project.title}
      canEdit={canEdit}
      wordCount={data.wordCount}
      wordsPerPage={data.wordsPerPage}
      sourcePageCount={data.sourcePageCount}
      printBudget={data.printBudget}
      mouRequired={data.mouRequired}
      settings={{
        defaultContactId: data.settings.defaultContactId,
        trimWidthIn: data.settings.trimWidthIn,
        trimHeightIn: data.settings.trimHeightIn,
        measurementUnit: data.settings.measurementUnit,
        languageExpansionFactor: data.settings.languageExpansionFactor,
        financialEmail: data.settings.financialEmail,
        ccEmails: data.settings.ccEmails,
      }}
      contacts={data.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        company: contact.company,
        email: contact.email,
        domain: contact.domain,
      }))}
      runs={data.runs.map((run) => ({
        id: run.id,
        sourceRunId: run.sourceRunId,
        title: run.title,
        kind: run.kind,
        printNumber: run.printNumber,
        status: run.status,
        campaignStartDate: run.campaignStartDate,
        campaignDueDate: run.campaignDueDate,
        fundingGoal: run.fundingGoal,
        fundingCurrency: run.fundingCurrency,
        reprintReason: run.reprintReason,
        contactId: run.contactId,
        contactName: run.contactName,
        contactCompany: run.contactCompany,
        contactEmail: run.contactEmail,
        quantityTarget: run.quantityTarget,
        requestedQuantities: run.requestedQuantities,
        trimWidthIn: run.trimWidthIn,
        trimHeightIn: run.trimHeightIn,
        languageExpansionFactor: run.languageExpansionFactor,
        estimatedTextPages: run.estimatedTextPages,
        quotedTextPages: run.quotedTextPages,
        coverPages: run.coverPages,
        textPaper: run.textPaper,
        coverPaper: run.coverPaper,
        binding: run.binding,
        deliveryLocation: run.deliveryLocation,
        latestProofUrl: run.latestProofUrl,
        notes: run.notes,
      }))}
      runFinance={data.runFinance}
      quotes={data.quotes.map((quote) => ({
        id: quote.id,
        runId: quote.runId,
        contactId: quote.contactId,
        kind: quote.kind,
        reviewStatus: quote.reviewStatus,
        invoiceNumber: quote.invoiceNumber,
        issueDate: quote.issueDate,
        title: quote.title,
        quantityCps: quote.quantityCps,
        unitPrice: quote.unitPrice,
        totalAmount: quote.totalAmount,
        depositAmount: quote.depositAmount,
        balanceAmount: quote.balanceAmount,
        currency: quote.currency,
        trimWidthMm: quote.trimWidthMm,
        trimHeightMm: quote.trimHeightMm,
        textPages: quote.textPages,
        coverPages: quote.coverPages,
        textSpec: quote.textSpec,
        coverSpec: quote.coverSpec,
        binding: quote.binding,
        deliveryLocation: quote.deliveryLocation,
        paymentTerms: quote.paymentTerms,
        reviewFlags: quote.reviewFlags,
        extractionSource: quote.extractionSource,
      }))}
      payments={data.payments.map((payment) => ({
        id: payment.id,
        runId: payment.runId,
        quoteId: payment.quoteId,
        kind: payment.kind,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        dueDate: payment.dueDate,
        neededByDate: payment.neededByDate,
        wireRequestedAt: payment.wireRequestedAt?.toISOString() ?? null,
        paidAt: payment.paidAt?.toISOString() ?? null,
        notes: payment.notes,
        taskId: payment.taskId,
        taskStatus: payment.taskStatus,
        taskAssigneeName: payment.taskAssigneeName,
      }))}
      threads={data.threads.map((thread) => ({
        id: thread.id,
        threadId: thread.threadId,
        subject: thread.subject,
        status: thread.status,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        lastDirection: thread.lastDirection,
        contactName: thread.contactName,
        latestProofUrl: thread.latestProofUrl,
      }))}
      proofs={data.proofs.map((proof) => ({
        attachmentId: proof.attachmentId,
        fileId: proof.fileId,
        originalName: proof.originalName,
        sizeBytes: proof.sizeBytes,
        receivedAt: proof.receivedAt?.toISOString() ?? null,
        threadId: proof.threadId,
        runId: proof.runId,
        runTitle: proof.runTitle,
      }))}
      extractionIssues={data.extractionIssues.map((issue) => ({
        id: issue.id,
        kind: issue.kind,
        runId: issue.runId,
        runTitle: issue.runTitle,
        fileName: issue.fileName,
        threadSubject: issue.threadSubject,
        error: issue.error,
        attempts: issue.attempts,
        updatedAt: issue.updatedAt.toISOString(),
      }))}
      quoteAttachments={toAttachmentObject(quoteAttachments)}
      paymentAttachments={toAttachmentObject(paymentAttachments)}
      initialEmailDrafts={emailDrafts.filter(
        (draft) => draft.kind === "print_rfq" || draft.kind === "print_wire"
      )}
      />
    </div>
  );
}
