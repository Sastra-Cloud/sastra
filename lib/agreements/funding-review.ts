/** Finance ownership is restricted to active people who can open the agreement. */
export function defaultInvoiceOwner(creators: Array<{ id: string | null; eligible: boolean }>): string | null {
  const ids = new Set(creators.map((creator) => creator.id));
  return ids.size === 1 && creators.every((creator) => creator.id && creator.eligible)
    ? creators[0].id : null;
}

export function fundingTotalsReconcile(total: number, allocations: number[], installments: number[]): boolean {
  const cents = (value: number) => Math.round(value * 100);
  return Number.isFinite(total) && total > 0 && allocations.length > 0 && installments.length > 0 &&
    [...allocations, ...installments].every((value) => Number.isFinite(value) && value > 0) &&
    allocations.reduce((sum, value) => sum + cents(value), 0) === cents(total) &&
    installments.reduce((sum, value) => sum + cents(value), 0) === cents(total);
}
