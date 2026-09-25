export type DraftIdentity = {
  senderName: string;
  organizationName: string;
};

function closing(identity: DraftIdentity) {
  return ["Best,", identity.senderName, identity.organizationName];
}

export function buildOperationalDraftSystemPrompt(identity: DraftIdentity) {
  return [
    "Draft a concise operational email for a translation-publishing team.",
    "Put the request and the most useful facts first. Use short paragraphs or a readable specification list when there are several details.",
    "Use a calm, direct voice; be warm with partners and printers and firm with finance.",
    "Keep the subject self-sufficient and near 50 characters when practical.",
    "Return only a subject and plain-text body. Do not use markdown or placeholders.",
    "Use only supplied facts and never invent names, dates, amounts, specifications, attachments, or commitments.",
    `For a new message, close with ${identity.senderName} and ${identity.organizationName}.`,
    "For print RFQ drafts, include context.pageCountLine verbatim when present and request both total price and price per copy for every quantity.",
  ].join(" ");
}

export function fundingProposalFallback(input: DraftIdentity & {
  recipientFirstName?: string | null;
  projectTitle: string;
  totalLabel: string;
  completionLabel?: string | null;
}) {
  const greeting = input.recipientFirstName
    ? `Dear ${input.recipientFirstName},`
    : "Hello,";
  return {
    subject: `Funding proposal: ${input.projectTitle}`,
    body: [
      greeting,
      "",
      `We’re requesting ${input.totalLabel} to fund ${input.projectTitle}. The attached quotation sets out the work and budget.`,
      ...(input.completionLabel
        ? ["", `We propose to complete the work by ${input.completionLabel}.`]
        : []),
      "",
      "If the proposal works for you, we can prepare an MoU. Please reply with any changes you’d like us to make.",
      "",
      ...closing(input),
    ].join("\n"),
  };
}

export function printRfqFallback(input: DraftIdentity & {
  contactName?: string | null;
  projectTitle: string;
  runTitle: string;
  pageCountLine: string;
  trimSize: string;
  coverPages: number;
  quantities: readonly number[];
  textPaper?: string | null;
  coverPaper?: string | null;
  binding?: string | null;
  deliveryLocation: string;
  notes?: string | null;
}) {
  return {
    subject: `Print quote request: ${input.projectTitle}`,
    body: [
      input.contactName ? `Hi ${input.contactName},` : "Hi,",
      "",
      `Please quote the following print run for ${input.projectTitle}:`,
      "",
      `- Title: ${input.runTitle}`,
      `- ${input.pageCountLine}`,
      `- Trim: ${input.trimSize}`,
      `- Cover: ${input.coverPages} pages${input.coverPaper ? `; ${input.coverPaper}` : ""}`,
      `- Quantities: ${input.quantities.join(", ")} copies`,
      input.textPaper ? `- Text material: ${input.textPaper}` : null,
      input.binding ? `- Binding: ${input.binding}` : null,
      `- Delivery: ${input.deliveryLocation}`,
      input.notes ? `- Notes: ${input.notes}` : null,
      "",
      "Please include the total price and price per copy for every quantity.",
      "",
      ...closing(input),
    ].filter((line): line is string => line !== null).join("\n"),
  };
}

export function wireRequestFallback(input: DraftIdentity & {
  amount: string;
  projectTitle: string;
  payee: string;
  paymentStage: string;
  purpose: string;
  neededBy?: string | null;
  confirmationRecipient: string;
}) {
  return {
    subject: `Wire request: ${input.amount} for ${input.projectTitle}`,
    body: [
      "Hello,",
      "",
      `Please arrange the ${input.paymentStage} payment to ${input.payee}: ${input.amount} for ${input.projectTitle}. This payment is for ${input.purpose}.`,
      "",
      "The invoice is attached and includes the wire instructions.",
      ...(input.neededBy ? ["", `Please complete the wire by ${input.neededBy}.`] : []),
      "",
      `Please send payment confirmation to ${input.confirmationRecipient}.`,
      "",
      ...closing(input),
    ].join("\n"),
  };
}

export type ExternalThreadMessage = {
  direction: string;
  fromAddr?: string | null;
  body: string;
};

export function establishedThreadClosing(messages: readonly ExternalThreadMessage[]) {
  const closingPattern = /^(best|thanks|thank you|kind regards|regards|sincerely|warmly|with thanks|grace and peace)[,!]?$/i;
  for (const message of [...messages].reverse()) {
    if (message.direction !== "outbound") continue;
    const lines = message.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const index = lines.findIndex((line) => closingPattern.test(line));
    if (index >= 0) return lines.slice(index, index + 3).join("\n");
  }
  return null;
}

export function buildExternalEmailDraftMessages(input: DraftIdentity & {
  from: string;
  to: string;
  cc?: string;
  intent: string;
  subjectHint?: string;
  bodyHint?: string;
  threadSubject?: string | null;
  threadMessages?: readonly ExternalThreadMessage[];
}) {
  const isReply = Boolean(input.threadSubject);
  const threadClosing = establishedThreadClosing(input.threadMessages ?? []);
  const system = [
    `You are drafting a professional external email on behalf of ${input.senderName} at ${input.organizationName}, sent from ${input.from}.`,
    "Put the request or decision first. Use short paragraphs, or a readable list when several specifications or actions are involved.",
    "Use a clear, warm, professional plain-text style. Keep the subject self-sufficient and near 50 characters when practical.",
    "Use only supplied facts. Do not invent names, dates, amounts, attachments, commitments, or placeholders.",
    isReply
      ? threadClosing
        ? `This is a reply. Mirror this established thread closing exactly:\n${threadClosing}`
        : "This is a reply. Continue the thread naturally; if a closing is needed, use the sender name and organization below."
      : `This is a new message. Close with:\nBest,\n${input.senderName}\n${input.organizationName}`,
    "Return a concise subject and complete plain-text body.",
  ].join("\n");
  const context = [
    `Recipient: ${input.to}`,
    input.cc ? `CC: ${input.cc}` : null,
    `Intent / key points: ${input.intent}`,
    input.subjectHint ? `Subject hint: ${input.subjectHint}` : null,
    input.bodyHint ? `Body hint: ${input.bodyHint}` : null,
    input.threadSubject
      ? `Reply within thread: ${input.threadSubject}`
      : null,
    ...(input.threadMessages ?? []).map(
      (message) => `[${message.direction} · ${message.fromAddr ?? "?"}] ${message.body}`
    ),
  ].filter((line): line is string => line !== null);
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: context.join("\n\n") },
  ];
}
