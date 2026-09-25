/**
 * AI credits are the only unit hosted users see. The conversion to the
 * provider's dollar cost lives here and in control-plane configuration, and
 * never in copy, help docs, or responses sent to the browser.
 */
export const CREDITS_PER_USD = 200;

/** Shown wherever AI stops because the month's credits are gone. */
export const CREDITS_USED_UP_MESSAGE =
  "Your AI credits are used up for this month. They refill on the 1st. Buy more credits or add your own AI key.";

/** Dollar cap that backs a number of credits. */
export function creditsToUsd(credits: number): number {
  return Math.max(0, credits) / CREDITS_PER_USD;
}

/** Credits consumed by a dollar cost, rounded up so a call never costs zero. */
export function usdToCredits(usd: number): number {
  return usd <= 0 ? 0 : Math.ceil(usd * CREDITS_PER_USD);
}
