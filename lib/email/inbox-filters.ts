export type InboxFilters = { bucket?: string; status?: string; project?: string; q?: string; page?: string };
export function inboxHref(filters: InboxFilters, patch: InboxFilters = {}) {
  const values = { ...filters, ...patch };
  const query = new URLSearchParams();
  for (const key of ["bucket", "status", "project", "q", "page"] as const) {
    if (values[key]) query.set(key, values[key]!);
  }
  return `/correspondence${query.size ? `?${query}` : ""}`;
}
export function inboxPage(value?: string): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}
