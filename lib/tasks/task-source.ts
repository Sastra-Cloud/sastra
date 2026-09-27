import type { TaskRow } from "./queries";

type SourceTask = Pick<TaskRow,
  "printPaymentId" | "royaltyPaymentId" | "licenseFeePaymentId" | "mouInvoicePaymentId" | "mouInvoiceSharedGroupId" | "approvalAssignmentId" | "printRunId"
>;

export function isSourceControlledTask(task: SourceTask): boolean {
  return Boolean(task.printPaymentId || task.royaltyPaymentId || task.licenseFeePaymentId || task.mouInvoicePaymentId || task.approvalAssignmentId);
}

export function taskSourceLink(task: SourceTask, projectSlug: string | null):
  { href: string; label: string } | null {
  if (!projectSlug) return null;
  if (task.printPaymentId) return {
    href: `/projects/${projectSlug}/print#payment-${task.printPaymentId}`,
    label: "Open printer payment",
  };
  if (task.licenseFeePaymentId) return {
    href: `/projects/${projectSlug}/rights#license-fee-${task.licenseFeePaymentId}`,
    label: "Open license fee",
  };
  if (task.royaltyPaymentId) return {
    href: `/projects/${projectSlug}/budget#royalty-${task.royaltyPaymentId}`,
    label: "Open royalty payment",
  };
  if (task.mouInvoicePaymentId) return {
    href: task.mouInvoiceSharedGroupId
      ? `/agreements/${task.mouInvoiceSharedGroupId}`
      : `/projects/${projectSlug}/budget#mou-payment-${task.mouInvoicePaymentId}`,
    label: "Open invoice schedule",
  };
  return null;
}
