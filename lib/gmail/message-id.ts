import { createHash } from "node:crypto";

/**
 * Some forwarded / mailing-list mail arrives with no `Message-ID` header. Rather
 * than drop it (losing correspondence), synthesize a STABLE id from the message's
 * own content so repeated IMAP fetches of the same message collapse to one row
 * under the `gmail_message_id` uniqueness guard. Deterministic — no randomness,
 * no clock — so idempotency holds across polls and restarts.
 */
export function synthesizeMessageId(input: {
  from?: string | null;
  date?: Date | null;
  subject?: string | null;
  text?: string | null;
}): string {
  const parts = [
    (input.from ?? "").toLowerCase(),
    input.date ? input.date.toISOString() : "",
    input.subject ?? "",
    (input.text ?? "").slice(0, 500),
  ].join("|");
  const hash = createHash("sha256").update(parts).digest("hex");
  return `synthetic-sha256:${hash}`;
}

/** RFC References chain with stable ordering and no repeated Message-IDs. */
export function buildReferencesHeader(
  references: string | null | undefined,
  parentMessageId: string | null | undefined
): string | null {
  const values = [references, parentMessageId]
    .filter((value): value is string => !!value?.trim())
    .flatMap((value) => value.trim().split(/\s+/))
    .filter(Boolean);
  const unique = [...new Set(values)];
  return unique.length ? unique.join(" ") : null;
}
