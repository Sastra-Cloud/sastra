import Link from "next/link";

import { cn } from "@/lib/utils";

export type TimelineRow = {
  id: string;
  label: string;
  start: string | null; // yyyy-mm-dd
  end: string | null;
  color?: string | null;
  href?: string;
  /** Milestone diamonds drawn on the row (dates outside the range are clamped). */
  markers?: { date: string; label: string }[];
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function ms(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function label(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A lightweight CSS Gantt: each row's bar is positioned across the shared date range. */
export function Timeline({ rows, today }: { rows: TimelineRow[]; today: string }) {
  const times: number[] = [];
  for (const r of rows) {
    const s = r.start ? ms(r.start) : null;
    const e = r.end ? ms(r.end) : null;
    if (s !== null) times.push(s);
    if (e !== null) times.push(e);
    for (const m of r.markers ?? []) {
      const t = ms(m.date);
      if (t !== null) times.push(t);
    }
  }
  const todayMs = ms(today);
  if (todayMs !== null) times.push(todayMs);

  if (times.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Add start and due dates to see a timeline.
      </p>
    );
  }

  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const pos = (t: number) => ((t - min) / span) * 100;
  const todayPct = todayMs !== null ? pos(todayMs) : null;

  return (
    <div className="min-w-0 max-w-full space-y-2">
      <div className="relative min-w-0">
        {todayPct !== null ? (
          <div
            className="pointer-events-none absolute inset-y-0 z-10 w-px bg-info"
            style={{ left: `${todayPct}%` }}
            aria-hidden
          />
        ) : null}
        <div className="space-y-1.5">
          {rows.map((r) => {
            const s = r.start ? ms(r.start) : r.end ? ms(r.end) : null;
            const e = r.end ? ms(r.end) : r.start ? ms(r.start) : null;
            const hasBar = s !== null && e !== null;
            const left = hasBar ? pos(Math.min(s!, e!)) : 0;
            const width = hasBar ? Math.max(2, pos(Math.max(s!, e!)) - left) : 0;
            return (
              <div
                key={r.id}
                className="grid min-w-0 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2"
              >
                <span className="truncate text-xs">
                  {r.href ? (
                    <Link href={r.href} className="hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </span>
                <div className="relative h-5 rounded bg-muted/40">
                  {hasBar ? (
                    <div
                      className={cn(
                        "absolute inset-y-0 rounded",
                        !r.color && "bg-[var(--chart-1)]"
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: r.color ?? undefined,
                      }}
                      title={`${r.start ?? "?"} → ${r.end ?? "?"}`}
                    />
                  ) : (
                    <span className="absolute inset-y-0 left-1 flex items-center text-[10px] text-muted-foreground">
                      no dates
                    </span>
                  )}
                  {(r.markers ?? []).map((m) => {
                    const t = ms(m.date);
                    if (t === null) return null;
                    return (
                      <span
                        key={`${m.date}-${m.label}`}
                        className="absolute top-1/2 z-10 block size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-background bg-foreground/70"
                        style={{ left: `${pos(t)}%` }}
                        title={`${m.label} · ${m.date}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between pl-[7.5rem] text-[10px] tabular-nums text-muted-foreground">
        <span>{label(min)}</span>
        <span>{label(max)}</span>
      </div>
    </div>
  );
}
