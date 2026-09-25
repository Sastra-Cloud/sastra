/**
 * How AI usage is shown to people. Self-hosted installations pay their own
 * provider and see dollars. Sastra Cloud workspaces see only **credits**; the
 * dollar cost behind a credit lives in `lib/hosted/credits.ts` and never in
 * copy. Pure, so client components and tests can use it.
 */
import { usdToCredits } from "@/lib/hosted/credits";

export type AiAmountUnit = "usd" | "credits";

/** Credits are counted from cost the same way the meter does: rounded up per amount. */
export function creditsFromUsd(usd: number): number {
  return usdToCredits(usd);
}

export function formatAiAmount(
  usd: number,
  unit: AiAmountUnit,
  options: { compact?: boolean } = {}
): string {
  const value = Number.isFinite(usd) ? usd : 0;
  if (unit === "credits") {
    const credits = creditsFromUsd(value);
    return `${credits.toLocaleString()} ${credits === 1 ? "credit" : "credits"}`;
  }
  if (options.compact && value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

/** Axis ticks and chart totals: a bare number for credits, `$x.xx` for dollars. */
export function formatAiAmountShort(usd: number, unit: AiAmountUnit): string {
  return unit === "credits" ? creditsFromUsd(usd).toLocaleString() : `$${Number(usd).toFixed(2)}`;
}

/** Column and tooltip label for the amount. */
export function aiAmountLabel(unit: AiAmountUnit): string {
  return unit === "credits" ? "Credits" : "Spend";
}

/** Percent of an allowance at which admins are warned. */
export const AI_ALLOWANCE_WARN_PERCENT = 80;
