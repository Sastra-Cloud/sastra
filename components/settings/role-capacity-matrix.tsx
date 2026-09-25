"use client";

import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Gauge } from "lucide-react";

import { setUserRoleCapacity } from "@/lib/capacity/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

type RoleCol = { id: string; label: string; color: string | null };
type Person = { id: string; name: string };
type Group = { key: string; name: string };
type Cap = {
  userId: string;
  projectRoleId: string;
  capacityGroupKey: string;
  projectsAtOnce: number;
};

const cellKey = (userId: string, roleId: string, groupKey: string) =>
  `${userId}:${roleId}:${groupKey}`;

export function RoleCapacityMatrix({
  people,
  roles,
  groups,
  capacities,
}: {
  people: Person[];
  roles: RoleCol[];
  groups: Group[];
  capacities: Cap[];
}) {
  const [, startTransition] = useTransition();
  const seed = useMemo(() => {
    const next: Record<string, string> = {};
    for (const capacity of capacities) {
      next[
        cellKey(
          capacity.userId,
          capacity.projectRoleId,
          capacity.capacityGroupKey
        )
      ] = String(capacity.projectsAtOnce);
    }
    return next;
  }, [capacities]);
  const [savedValues, setSavedValues] = usePropState(seed);
  const [values, setValues] = usePropState(seed);

  function persist(userId: string, roleId: string, groupKey: string, raw: string) {
    const n = raw.trim() === "" ? 0 : Math.max(0, Math.min(50, Math.floor(Number(raw) || 0)));
    const key = cellKey(userId, roleId, groupKey);
    const previous = savedValues[key] ?? "";
    startTransition(async () => {
      const res = await setUserRoleCapacity({
        userId,
        projectRoleId: roleId,
        capacityGroupKey: groupKey,
        projectsAtOnce: n,
      });
      if (!res.ok) {
        setValues((current) => ({ ...current, [key]: previous }));
        toast.error(res.error.message);
        return;
      }
      setSavedValues((current) => ({ ...current, [key]: String(n) }));
      setValues((current) => ({ ...current, [key]: n === 0 ? "" : String(n) }));
    });
  }

  if (people.length === 0 || roles.length === 0 || groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="size-4" />Role capacity</CardTitle>
          <CardDescription>
            {roles.length === 0
              ? "Add project roles first (Settings ▸ Roles), then set who can do them here."
              : groups.length === 0
                ? "Define work paths first (Settings ▸ Workspace ▸ Planning capacity)."
                : "No teammates to configure yet."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Gauge className="size-4" />Role capacity by work path</CardTitle>
        <CardDescription>
          How many projects each person can carry at once in each role, <b>per work
          path</b>. Someone might do 2 book translations at once but only 1 for
          articles &amp; podcasts — or work a path not at all (leave those cells
          blank). Together this is the team&apos;s per-path staffing; it drives each
          path&apos;s bottleneck on the Schedule and makes due-date estimates
          account for who&apos;s available on that path.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-[3px] bg-primary" />
              <h3 className="font-heading text-sm font-semibold">{group.name}</h3>
              <span className="text-xs text-muted-foreground">— projects at once, per role</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Person
                    </th>
                    {roles.map((r) => (
                      <th key={r.id} className="px-2 py-2 text-center align-bottom">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                          <span className="size-2 rounded-full" style={{ background: r.color ?? "var(--muted-foreground)" }} />
                          <span className="whitespace-nowrap">{r.label}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="sticky left-0 z-10 border-t bg-card px-3 py-1.5 font-medium whitespace-nowrap">
                        {p.name}
                      </td>
                      {roles.map((r) => {
                        const key = cellKey(p.id, r.id, group.key);
                        const v = values[key] ?? "";
                        return (
                          <td key={r.id} className="border-t px-2 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={50}
                              inputMode="numeric"
                              aria-label={`${p.name} — ${r.label} on ${group.name}, projects at once`}
                              value={v}
                              onChange={(e) => setValues((s) => ({ ...s, [key]: e.target.value }))}
                              onBlur={(e) => {
                                const normalized = e.target.value.trim();
                                if ((normalized || "0") !== (savedValues[key] ?? "0")) persist(p.id, r.id, group.key, e.target.value);
                              }}
                              className={cn(
                                "h-8 w-12 rounded-md border bg-transparent text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
                                v && v !== "0" ? "border-input" : "border-dashed border-muted-foreground/30 text-muted-foreground"
                              )}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
