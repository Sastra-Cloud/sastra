/** Accept IANA timezones and their valid aliases, without rewriting saved values. */
export function isValidTimeZone(value: string): boolean {
  if (!value.trim() || /^[+-]/.test(value) || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}
export function timezoneOptions(current = "UTC"): string[] {
  return [...new Set([current, "UTC", ...Intl.supportedValuesOf("timeZone")])].sort();
}
