/** Pure budget helpers (no DB) so they're unit-testable. */

export const DEFAULT_MONTHLY_BUDGET_USD = 5;

export type BudgetStatus = {
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  enabled: boolean;
  blocked: boolean;
};

/** First instant of the current calendar month in UTC (the budget reset point). */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function computeBudgetStatus(
  spentUsd: number,
  budgetUsd: number,
  enabled: boolean
): BudgetStatus {
  return {
    spentUsd,
    budgetUsd,
    remainingUsd: Math.max(0, budgetUsd - spentUsd),
    enabled,
    blocked: !enabled || spentUsd >= budgetUsd,
  };
}
