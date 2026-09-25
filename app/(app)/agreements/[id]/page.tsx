import { getMouInvoiceDetails } from "@/lib/budget/invoice-details";
import Link from "next/link";
import { PaymentDelivery } from "@/components/agreements/payment-delivery";
import { AgreementInvoiceSend } from "@/components/agreements/invoice-send";
import { listEmailDraftsForProject } from "@/lib/email/draft-store";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  FileSignature,
  History,
  Layers3,
  LockKeyhole,
  Users,
} from "lucide-react";
import { asc, and, eq, inArray } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects, user } from "@/lib/db/schema";
import { getSharedMouGroup } from "@/lib/agreements/queries";
import { listAttachments } from "@/lib/files/queries";
import { formatDate, timeAgo } from "@/lib/format";
import { PageHero, PageShell } from "@/components/cockpit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileAttachments } from "@/components/files/file-attachments";
import {
  AgreementNotes,
  MembershipManager,
  SharedPaymentControls,
} from "@/components/agreements/agreement-controls";

export const dynamic = "force-dynamic";

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(value));
}

export default async function SharedMouGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("manager");
  const { id } = await params;
  const [data, projectOptions, assignees, sourceFiles] = await Promise.all([
    getSharedMouGroup(id),
    db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .orderBy(asc(projects.title)),
    db.select({ id: user.id, name: user.name }).from(user).where(and(eq(user.isActive, true), eq(user.isBot, false), inArray(user.role, ["manager", "admin", "super_admin"]))),
    listAttachments("agreement_group", id),
  ]);
  if (!data) notFound();
  const { group, members, payments, audits, receipts } = data;
  const [drafts, workspace] = await Promise.all([listEmailDraftsForProject(session.user.id, group.administrativeProjectId), getWorkspaceSettings()]);
  const missingIssuerFields = [
    !(workspace.invoicePaymentDetails?.issuerName?.trim() || workspace.legalName?.trim() || workspace.orgName?.trim()) && "invoice issuer name",
    !workspace.contactEmail?.trim() && "public contact email",
    !(workspace.paymentInstructions?.trim() || workspace.invoicePaymentDetails?.fields.some((field) => field.value.trim())) && "payment instructions",
  ].filter(Boolean);
  const invoiceDefaults = await Promise.all(payments.map((payment) => getMouInvoiceDetails({ projectId: group.administrativeProjectId, sharedMouGroupId: group.id, trigger: payment.trigger, publicDescription: payment.notes })));
  const activeMembers = members.filter((member) => member.active);
  const completed = activeMembers.filter(
    (member) => member.status === "completed"
  ).length;
  const allocated = activeMembers.reduce(
    (sum, member) => sum + Number(member.allocationAmount),
    0
  );
  const completionPayment = payments.find(
    (payment) => payment.trigger === "on_completion"
  );
  const readinessText =
    completionPayment?.readinessReason ||
    `${completed} of ${activeMembers.length} projects complete.`;

  return (
    <PageShell className="space-y-5">
      <PageHero
        eyebrow={
          <Link
            href="/agreements"
            className="inline-flex min-h-8 items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Shared MoUs
          </Link>
        }
        icon={<Layers3 className="size-5" />}
        title={group.name}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{group.counterparty ?? "Counterparty not set"}</span>
          <span>Signed {formatDate(group.signedDate)}</span>
          <span className="font-medium text-foreground">
            {money(group.agreementTotal, group.currency)}
          </span>
        </div>
      </PageHero>

      <Card
        className={
          completionPayment?.readinessStatus === "ready"
            ? "border-success/40 bg-success/5"
            : "border-info/30 bg-info/5"
        }
      >
        <CardContent className="flex items-start gap-3 py-4">
          {completionPayment?.readinessStatus === "ready" ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          ) : (
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-info" />
          )}
          <div>
            <p className="font-medium">Collective invoice gate</p>
            <p className="text-sm text-muted-foreground">{readinessText}</p>
          </div>
        </CardContent>
      </Card>

      {group.reviewRequired ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Manager review required</p>
            <p className="text-muted-foreground">{group.reviewNote}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.75fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" /> Covered projects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeMembers.map((member) => {
                const pct = member.totalTasks
                  ? Math.round((member.completedTasks / member.totalTasks) * 100)
                  : 0;
                return (
                  <div key={member.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/projects/${member.slug}`}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {member.title}
                        </Link>
                        <p className="text-xs capitalize text-muted-foreground">
                          {member.status.replaceAll("_", " ")} · {member.completedTasks} of {member.totalTasks} tasks
                        </p>
                      </div>
                      <span className="font-medium tabular-nums">
                        {money(member.allocationAmount, group.currency)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Allocation reconciliation</span>
                <span className={group.reviewRequired ? "font-medium text-warning" : "font-medium text-success"}>
                  {money(allocated, group.currency)} of {money(group.agreementTotal, group.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="size-4" /> Shared payment schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {missingIssuerFields.length > 0 && <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                <p className="font-medium">Complete your organization’s invoice details</p>
                <p>Missing: {missingIssuerFields.join(", ")}. These are your issuer details, separate from the invoice recipient.</p>
                <Link href="/settings/workspace#invoice-issuer" className="mt-2 inline-block text-primary underline underline-offset-4">Open invoice settings</Link>
              </div>}
              {payments.map((payment, index) => (
                <div key={payment.id} id={`payment-${payment.id}`} className="scroll-mt-24 rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium capitalize">
                        {payment.trigger.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.readinessReason ?? "Readiness has not been evaluated yet."}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{money(payment.amount, payment.currency)}</p>
                      <p className="text-xs text-muted-foreground">Earliest {formatDate(payment.dueDate)}</p>
                    </div>
                  </div>
                  <SharedPaymentControls payment={payment} assignees={assignees} issuerReady={missingIssuerFields.length === 0} invoiceDefaults={invoiceDefaults[index]} />
                  {payment.deliveryRequirements?.length ? <PaymentDelivery key={`${payment.id}:${payment.deliveryConfirmedAt}`} paymentId={payment.id} requirements={payment.deliveryRequirements} initialEvidence={payment.deliveryEvidence ?? []} confirmedAt={payment.deliveryConfirmedAt} fileOptions={sourceFiles} /> : null}
                  {payment.invoiceId ? <AgreementInvoiceSend key={payment.invoiceId} invoiceId={payment.invoiceId} invoiceFileId={payment.invoiceFileId} invoiceNumber={payment.invoiceNumber ?? ""}
                    recipient={payment.invoiceRecipient ?? group.contactEmail ?? ""} projectId={group.administrativeProjectId}
                    defaultCc={workspace.defaultCcEmails} draft={drafts.find((draft) => draft.contextId === payment.invoiceId) ?? null}
                    evidence={payment.deliveryEvidence ?? []} enabled={payment.invoiceStatus === "issued" && payment.readinessStatus === "invoiced"} /> : null}
                </div>
              ))}
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments scheduled.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audited membership controls</CardTitle>
            </CardHeader>
            <CardContent>
              <MembershipManager
                groupId={group.id}
                members={activeMembers.map((member) => ({
                  id: member.id,
                  projectId: member.projectId,
                  title: member.title,
                  allocationAmount: member.allocationAmount,
                }))}
                projects={projectOptions}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileSignature className="size-4" /> Source agreement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Counterparty</dt><dd>{group.counterparty ?? "—"}</dd>
                <dt className="text-muted-foreground">Contact</dt><dd>{group.contactName ?? "—"}</dd>
                <dt className="text-muted-foreground">Email</dt><dd>{group.contactEmail ?? "—"}</dd>
                <dt className="text-muted-foreground">Signed</dt><dd>{formatDate(group.signedDate)}</dd>
              </dl>
              <FileAttachments
                targetType="agreement_group"
                targetId={group.id}
                attachments={sourceFiles}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Receipts & allocations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {receipts.map((receipt) => {
                const reconciled = Math.abs(Number(receipt.amount) - Number(receipt.allocatedAmount)) <= 0.005;
                return (
                  <div key={receipt.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{formatDate(receipt.receivedDate)}</span>
                      <span className="font-medium tabular-nums">{money(receipt.amount, receipt.currency)}</span>
                    </div>
                    <p className={reconciled ? "text-xs text-success" : "text-xs text-warning"}>
                      {money(receipt.allocatedAmount, receipt.currency)} allocated · {reconciled ? "reconciled" : "review required"}
                    </p>
                  </div>
                );
              })}
              {receipts.length === 0 ? <p className="text-sm text-muted-foreground">No payments received.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Manager-only notes</CardTitle></CardHeader>
            <CardContent><AgreementNotes groupId={group.id} initial={group.managerNotes} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-4" /> Membership history</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {audits.slice(0, 12).map((audit) => (
                <div key={audit.id} className="border-l-2 pl-3 text-sm">
                  <p><span className="font-medium capitalize">{audit.action.replaceAll("_", " ")}</span> · {audit.projectTitle}</p>
                  <p className="text-xs text-muted-foreground">{audit.reason}</p>
                  <p className="text-[11px] text-muted-foreground">{audit.managerName ?? "Manager"} · {timeAgo(audit.createdAt)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
