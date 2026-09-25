"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createProjectRole,
  toggleProjectRoleActive,
  type RoleState,
} from "@/lib/team/roles-actions";
import { updateProjectRoleDuration } from "@/lib/capacity/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePropState } from "@/hooks/use-prop-state";

type Role = {
  id: string;
  key: string;
  label: string;
  color: string | null;
  defaultDurationDays: number | null;
  isActive: boolean;
};

export function RolesManager({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleRoles, setVisibleRoles] = usePropState(roles);
  const [state, action, creating] = useActionState(
    createProjectRole,
    {} as RoleState
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Role added");
      router.refresh();
    }
  }, [state, router]);

  function saveDuration(role: Role, raw: string) {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Math.max(0, Math.min(3650, Math.floor(Number(trimmed) || 0)));
    if (next === (role.defaultDurationDays ?? null)) return;
    start(async () => {
      const res = await updateProjectRoleDuration({ roleId: role.id, defaultDurationDays: next });
      if (res.ok) router.refresh();
      else toast.error(res.error.message);
    });
  }

  function toggle(role: Role) {
    const previous = visibleRoles;
    setVisibleRoles((current) =>
      current.map((item) =>
        item.id === role.id ? { ...item, isActive: !item.isActive } : item
      )
    );
    start(async () => {
      try {
        await toggleProjectRoleActive(role.id, !role.isActive);
        router.refresh();
      } catch {
        setVisibleRoles(previous);
        toast.error("Could not update the role.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-medium">Add a project role</p>
          <form action={action} className="flex flex-col gap-2 sm:flex-row">
            <Input name="label" placeholder="e.g. Narration" required className="flex-1" />
            <input
              type="color"
              name="color"
              defaultValue="#64748b"
              aria-label="Color"
              className="h-9 w-12 rounded-md border border-input bg-transparent p-1"
            />
            <Button type="submit" disabled={creating}>
              {creating ? "Adding…" : "Add role"}
            </Button>
          </form>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-2" aria-busy={pending}>
        {visibleRoles.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ background: r.color ?? "#64748b" }}
                aria-hidden
              />
              <span className="text-sm font-medium">{r.label}</span>
              {!r.isActive ? (
                <Badge variant="secondary">Inactive</Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="number"
                  min={0}
                  max={3650}
                  defaultValue={r.defaultDurationDays ?? ""}
                  placeholder="—"
                  aria-label={`${r.label} typical stage duration in days`}
                  onBlur={(e) => saveDuration(r, e.target.value)}
                  className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
                days
              </label>
              <Button variant="ghost" size="sm" onClick={() => toggle(r)}>
                {r.isActive ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
