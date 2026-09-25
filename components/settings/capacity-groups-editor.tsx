"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROJECT_KINDS, PROJECT_KIND_LABELS, type ProjectKind } from "@/lib/projects/kinds";
import type { CapacityGroup } from "@/lib/planning/groups";

/**
 * Editor for capacity groups (work paths). Each project kind belongs to exactly
 * one path, and each path has its own "at once" concurrency. State is mirrored
 * into a hidden input the parent form reads as JSON (`capacityGroups`).
 *
 * Kind assignment is radio-like: clicking a kind moves it to that path and out
 * of any other, so coverage stays complete and unambiguous.
 */
export function CapacityGroupsEditor({ defaultGroups }: { defaultGroups: CapacityGroup[] }) {
  const [groups, setGroups] = useState<CapacityGroup[]>(() =>
    defaultGroups.length
      ? defaultGroups.map((g) => ({ ...g, kinds: [...g.kinds] }))
      : [{ key: "path-1", name: "Books", concurrency: 3, kinds: [...PROJECT_KINDS] }]
  );

  const serialized = useMemo(() => JSON.stringify(groups), [groups]);

  function update(index: number, patch: Partial<CapacityGroup>) {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function assignKind(groupIndex: number, kind: ProjectKind) {
    setGroups((prev) =>
      prev.map((g, i) => ({
        ...g,
        kinds: i === groupIndex
          ? g.kinds.includes(kind)
            ? g.kinds
            : [...g.kinds, kind]
          : g.kinds.filter((k) => k !== kind),
      }))
    );
  }

  function addGroup() {
    setGroups((prev) => {
      const used = new Set(prev.map((g) => g.key));
      let n = prev.length + 1;
      let key = `path-${n}`;
      while (used.has(key)) key = `path-${++n}`;
      return [...prev, { key, name: "New work path", concurrency: 3, kinds: [] }];
    });
  }

  function removeGroup(index: number) {
    setGroups((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      // Re-home the removed path's kinds into the first remaining path so
      // nothing is orphaned (matches server-side normalization).
      const orphaned = removed.kinds.filter((k) => !rest.some((g) => g.kinds.includes(k)));
      return rest.map((g, i) =>
        i === 0 ? { ...g, kinds: [...g.kinds, ...orphaned] } : g
      );
    });
  }

  return (
    <div className="grid gap-3">
      <input type="hidden" name="capacityGroups" value={serialized} />
      {groups.map((group, index) => {
        const empty = group.kinds.length === 0;
        return (
          <div key={group.key} className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid min-w-40 flex-1 gap-1.5">
                <Label htmlFor={`cg-name-${group.key}`}>Path name</Label>
                <Input
                  id={`cg-name-${group.key}`}
                  value={group.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="e.g. Books"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>At once</Label>
                <div className="flex h-9 items-center gap-1 rounded-md border bg-background px-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Fewer at once"
                    onClick={() => update(index, { concurrency: Math.max(1, group.concurrency - 1) })}
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {group.concurrency}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="More at once"
                    onClick={() => update(index, { concurrency: Math.min(50, group.concurrency + 1) })}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              </div>
              {groups.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${group.name || "path"}`}
                  onClick={() => removeGroup(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label>Project types in this path</Label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_KINDS.map((kind) => {
                  const active = group.kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => assignKind(index, kind)}
                      aria-pressed={active}
                      className={
                        "rounded-full border px-3 py-1 text-sm transition-colors " +
                        (active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-muted-foreground hover:bg-muted")
                      }
                    >
                      {PROJECT_KIND_LABELS[kind]}
                    </button>
                  );
                })}
              </div>
              {empty && (
                <p className="text-xs text-muted-foreground">
                  This path has no project types and will be removed when you save.
                </p>
              )}
            </div>
          </div>
        );
      })}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={addGroup}>
          <Plus className="size-4" />
          Add work path
        </Button>
      </div>
    </div>
  );
}
