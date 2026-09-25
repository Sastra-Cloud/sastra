/** Human file size: "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Parse a 'YYYY-MM-DD' date string as a local date (no timezone shift). */
function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jun 23, 2026" — or null-safe em dash. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseYmd(value);
  if (!d) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Days from today to the given date (negative = overdue). null if no date. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const d = parseYmd(value);
  if (!d) return null;
  const today = new Date();
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** Relative time: "just now", "3h ago", "2d ago", else a date. */
export function timeAgo(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Human due label: "Overdue 3d", "Due today", "Due in 5d", or a date. */
export function dueLabel(value: string | null | undefined): {
  text: string;
  tone: "overdue" | "soon" | "normal" | "none";
} {
  const n = daysUntil(value);
  if (n === null) return { text: "No due date", tone: "none" };
  if (n < 0) return { text: `Overdue ${Math.abs(n)}d`, tone: "overdue" };
  if (n === 0) return { text: "Due today", tone: "soon" };
  if (n <= 3) return { text: `Due in ${n}d`, tone: "soon" };
  return { text: formatDate(value), tone: "normal" };
}
