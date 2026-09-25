import { z } from "zod";

export const projectUpdateSuggestionDataSchema = z.object({
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  projectId: z.string().uuid(),
  projectSlug: z.string().min(1),
  projectTitle: z.string().min(1),
  suggestedBody: z.string().trim().min(1).max(5_000),
  reason: z.string().trim().min(1).max(1_000),
});

export type ProjectUpdateSuggestionData = z.infer<
  typeof projectUpdateSuggestionDataSchema
>;

function printProofLabel(bodyText: string | null) {
  const text = bodyText?.toLocaleLowerCase() ?? "";
  const proofKind = text.includes("cover")
    ? "cover proof"
    : text.includes("interior")
      ? "interior proof"
      : "print proof";
  return /\b(revised|updated|new version)\b/.test(text)
    ? `revised ${proofKind}`
    : proofKind;
}

function senderNameFromAddress(value: string | null) {
  const localPart = value
    ?.match(/[A-Z0-9._%+-]+@/i)?.[0]
    ?.slice(0, -1)
    .trim();
  if (!localPart) return "the printer";
  const generic = new Set([
    "admin",
    "contact",
    "hello",
    "info",
    "orders",
    "print",
    "printing",
    "projects",
    "sales",
    "support",
  ]);
  if (generic.has(localPart.toLocaleLowerCase())) return "the printer";
  return localPart
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase() + part.slice(1))
    .join(" ");
}

export function shouldSuggestProjectUpdateFromProof(bodyText: string | null) {
  return /\b(approval|approve|review|feedback|confirm)\b/i.test(bodyText ?? "");
}

export function buildPrintProofProjectUpdate(bodyText: string | null) {
  const revision = printProofLabel(bodyText);
  const proofKind = revision.replace(/^revised /, "");

  return {
    suggestedBody: `The printer sent the ${revision} for approval. It is ready for review.`,
    reason: `A linked printer email includes an attached ${proofKind} and asks for approval.`,
  };
}

export function buildPrintProofTaskSuggestion(input: {
  bodyText: string | null;
  projectTitle: string;
  sourceSender: string | null;
  recipientName: string;
}) {
  const proof = printProofLabel(input.bodyText);
  const sender = senderNameFromAddress(input.sourceSender);
  return {
    title: `Review ${proof} and reply to ${sender}`,
    description: `Review the attached ${proof} for ${input.projectTitle}, then reply to ${sender} in the email thread.`,
    reason: `This proof email was sent directly to ${input.recipientName} and asks for approval.`,
  };
}
