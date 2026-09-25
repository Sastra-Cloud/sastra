/**
 * Drizzle column decoders normally return Date objects, while raw Postgres
 * aggregates can return timestamp strings. Normalize both without assuming the
 * runtime shape matches a TypeScript annotation.
 */
export function serializeActivityTimestamp(
  value: Date | string | null
): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimeZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized);
  const parsed = new Date(hasTimeZone ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
