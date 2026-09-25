export const EMAIL_DRAFT_KINDS = [
  "funding_proposal",
  "mou_invoice",
  "print_rfq",
  "print_wire",
  "thread_reply",
] as const;

export type EmailDraftKind = (typeof EMAIL_DRAFT_KINDS)[number];

export type EmailDraftValue = {
  evidence?: Array<{ requirement: string; url: string; fileId?: string }>;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  body: string;
  baselineSubject: string | null;
  baselineBody: string | null;
};

export type EmailDraftDTO = EmailDraftValue & {
  id: string;
  projectId: string | null;
  kind: EmailDraftKind;
  contextId: string;
  updatedAt: string;
};

export type SaveEmailDraftInput = EmailDraftValue & {
  projectId: string | null;
  kind: EmailDraftKind;
  contextId: string;
};

export function emailDraftValueEqual(
  left: EmailDraftValue,
  right: EmailDraftValue
) {
  return (
    JSON.stringify(left.evidence ?? []) === JSON.stringify(right.evidence ?? []) &&
    left.subject === right.subject &&
    left.body === right.body &&
    left.baselineSubject === right.baselineSubject &&
    left.baselineBody === right.baselineBody &&
    left.toAddresses.join("\n") === right.toAddresses.join("\n") &&
    left.ccAddresses.join("\n") === right.ccAddresses.join("\n")
  );
}
