import Link from "next/link";
import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react";

import type { CapacityByPath, CapacityView, PathCapacityView } from "@/lib/capacity/roles";
import { cn } from "@/lib/utils";
import { PROJECT_KIND_LABELS, type ProjectKind } from "@/lib/projects/kinds";

function toneFor(utilization: number): { fill: string; text: string } {
  if (utilization >= 1) return { fill: "bg-destructive", text: "text-destructive" };
  if (utilization >= 0.75) return { fill: "bg-warning", text: "text-warning" };
  return { fill: "bg-success", text: "text-success" };
}

export function TeamCapacityView({ data }: { data: CapacityByPath }) {
  const anyStaffing =
    data.overall.roles.length > 0 || data.paths.some((p) => p.view.roles.length > 0);

  if (!anyStaffing) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <Gauge className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No role capacity set yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Set who can do which role on each work path, and how many projects each
          can carry at once, in{" "}
          <Link href="/settings/team" className="text-primary hover:underline">
            Settings ▸ Team ▸ Role capacity
          </Link>
          . Then this shows where each path&apos;s pipeline jams.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Each work path runs in parallel with its own people. A path can be jammed
        while another has room, so capacity is assessed per path.
      </p>
      {data.paths.map((path) => (
        <PathCapacityBlock key={path.group.key} path={path} />
      ))}
    </div>
  );
}

function PathCapacityBlock({ path }: { path: PathCapacityView }) {
  const { group, view } = path;
  const { roles, people, bottleneck, suggestedConcurrency } = view;

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-[3px] bg-primary" />
        <h2 className="font-heading text-base font-semibold">{group.name}</h2>
        {group.kinds?.map((kind) => (
          <span
            key={kind}
            className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
          >
            {PROJECT_KIND_LABELS[kind as ProjectKind]}
          </span>
        ))}
        <Link href="/settings/team" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          Configure
        </Link>
      </div>

      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No one is set up to work this path yet.{" "}
          <Link href="/settings/team" className="text-primary hover:underline">
            Assign capacity
          </Link>
          .
        </p>
      ) : (
        <>
          <Headline
            bottleneck={bottleneck}
            suggestedConcurrency={suggestedConcurrency}
            roles={roles}
          />

          {/* role bars */}
          <div className="space-y-2.5">
            {roles.map((r) => {
              const pct = r.capacity > 0 ? Math.min(100, Math.round((r.load / r.capacity) * 100)) : r.load > 0 ? 100 : 0;
              const tone = r.unstaffed ? { fill: "bg-destructive", text: "text-destructive" } : toneFor(r.utilization);
              return (
                <div key={r.roleId} className="grid grid-cols-[130px_1fr_84px] items-center gap-3 sm:grid-cols-[160px_1fr_92px]">
                  <span className="flex items-center gap-2 truncate text-sm">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color ?? "var(--muted-foreground)" }} />
                    <span className="truncate">{r.label}</span>
                    {r.isBottleneck && r.utilization >= 1 ? (
                      <span className="shrink-0 rounded bg-destructive/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        Bottleneck
                      </span>
                    ) : null}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-foreground/8">
                    <span className={cn("block h-full rounded-full", tone.fill)} style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {r.unstaffed ? (
                      <span className="text-destructive">{r.load} · no one</span>
                    ) : (
                      <><b className="text-foreground">{r.load}</b>/{r.capacity}</>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* people */}
          {people.length > 0 ? (
            <ul className="divide-y border-t pt-1">
              {people.map((p) => {
                const status =
                  p.status === "full"
                    ? { label: "Booked up", cls: "bg-destructive/12 text-destructive" }
                    : p.status === "tight"
                      ? { label: "Nearly full", cls: "bg-warning/15 text-warning" }
                      : { label: "Has room", cls: "bg-success/12 text-success" };
                return (
                  <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <span className="w-32 shrink-0 truncate text-sm font-medium">{p.userName}</span>
                    <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {p.roles.map((r) => (
                        <span key={r.roleId} className="inline-flex items-center gap-1.5 rounded-full bg-foreground/6 px-2 py-0.5 text-xs tabular-nums">
                          <span className="size-1.5 rounded-full" style={{ background: r.color ?? "var(--muted-foreground)" }} />
                          {r.label} {r.used}/{r.capacity}
                        </span>
                      ))}
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", status.cls)}>
                      {status.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

function Headline({
  bottleneck,
  suggestedConcurrency,
  roles,
}: {
  bottleneck: CapacityView["bottleneck"];
  suggestedConcurrency: number;
  roles: CapacityView["roles"];
}) {
  const unstaffed = roles.filter((r) => r.unstaffed);
  if (bottleneck && bottleneck.capacity > 0 && bottleneck.load >= bottleneck.capacity) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-destructive bg-destructive/8 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="text-pretty">
          <b className="font-heading">{bottleneck.label}</b> is the bottleneck here —
          fully booked at <b className="tabular-nums">{bottleneck.load} of {bottleneck.capacity}</b>.
          A realistic cap for this path is about{" "}
          <b className="tabular-nums">{suggestedConcurrency} at a time</b>. Add a{" "}
          {bottleneck.label.toLowerCase()} person, raise their &ldquo;at once&rdquo;, or run fewer.
        </p>
      </div>
    );
  }
  if (unstaffed.length > 0) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-destructive bg-destructive/8 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="text-pretty">
          {unstaffed.map((r) => r.label).join(", ")} {unstaffed.length === 1 ? "is" : "are"}{" "}
          needed now but nobody on this path can do {unstaffed.length === 1 ? "it" : "them"}. Assign
          capacity in{" "}
          <Link href="/settings/team" className="text-primary hover:underline">Settings ▸ Team</Link>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-success/50 bg-success/8 p-3 text-sm">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      <p className="text-pretty">
        No role is maxed out{bottleneck ? <> — tightest is <b>{bottleneck.label}</b> ({bottleneck.load} of {bottleneck.capacity})</> : null}.
        Room to take on more{suggestedConcurrency > 0 ? <> (about <b className="tabular-nums">{suggestedConcurrency} at a time</b>)</> : null}.
      </p>
    </div>
  );
}
