"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { confirmDialog } from "@/lib/dialog-requests";
import { addProjectManager, removeProjectManager } from "@/lib/projects/manager-actions";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";

type Manager = { userId: string; name: string; image: string | null };
type Change = { kind: "add"; manager: Manager } | { kind: "remove"; manager: Manager };
const update = (managers: Manager[], change: Change) => change.kind === "add"
  ? [...managers.filter((manager) => manager.userId !== change.manager.userId), change.manager]
  : managers.filter((manager) => manager.userId !== change.manager.userId);
const getKey = (change: Change) => change.manager.userId;

export function ProjectManagers({ projectId, canAssign, managers, members }: {
  projectId: string;
  canAssign: boolean;
  managers: Manager[];
  members: Manager[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const { state: visible, pending, isPending, run } = useOptimisticAction({ state: managers, update, getKey });
  const available = members.filter((member) => !visible.some((manager) => manager.userId === member.userId));

  async function grant() {
    const manager = available.find((member) => member.userId === selected);
    if (!manager || isPending(manager.userId)) return;
    if (!(await confirmDialog(`Let ${manager.name} manage this project's details, stages, tasks, and members? Workspace settings and finance access stay the same.`))) return;
    run({ kind: "add", manager }, () => addProjectManager(projectId, manager.userId), {
      errorMessage: "Could not grant project access. Try again.",
      reconcile: (saved, current) => current.map((item) => item.userId === saved.userId ? saved : item),
      onSuccess: () => { setSelected(""); router.refresh(); },
    });
  }

  async function revoke(manager: Manager) {
    if (isPending(manager.userId)) return;
    if (!(await confirmDialog(`Remove ${manager.name}'s management access to this project? Their project roles stay the same.`))) return;
    run({ kind: "remove", manager }, () => removeProjectManager(projectId, manager.userId), {
      errorMessage: "Could not remove project access. Try again.",
      onSuccess: () => router.refresh(),
    });
  }

  return <Card><CardContent className="space-y-4 py-4" aria-busy={pending}>
    <div className="space-y-1">
      <h2 className="text-sm font-medium">Project managers</h2>
      <p className="text-sm text-muted-foreground">Assigned members can manage this project's details, stages, tasks, and members.</p>
      <p className="text-xs text-muted-foreground">Workspace managers already manage every project. Finance, rights, printing, and workspace settings keep their existing permissions.</p>
    </div>
    {pending ? <p className="text-xs text-muted-foreground" role="status">Saving project access…</p> : null}
    {visible.length ? <ul className="space-y-2">{visible.map((manager) => <li key={manager.userId}
      className="flex items-center gap-2.5 rounded-md border px-3 py-2" aria-busy={isPending(manager.userId)}>
      <UserAvatar name={manager.name} image={manager.image} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{manager.name}</span>
      {isPending(manager.userId) ? <span className="text-xs text-muted-foreground" role="status">Saving…</span> : null}
      {canAssign ? <Button variant="ghost" size="icon-sm" className="size-11 shrink-0 sm:size-9" aria-label={`Remove management access for ${manager.name}`}
        disabled={isPending(manager.userId)} onClick={() => revoke(manager)}><X className="size-4" /></Button> : null}
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No members have project management access.</p>}
    {canAssign ? <div className="flex flex-col gap-2 sm:flex-row">
      <select aria-label="Project manager" value={available.some((member) => member.userId === selected) ? selected : ""}
        onChange={(event) => setSelected(event.target.value)}
        className="h-11 min-w-0 flex-none rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:flex-1">
        <option value="">Select member…</option>
        {available.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
      </select>
      <Button className="min-h-11 sm:min-h-9" onClick={grant} disabled={!available.some((member) => member.userId === selected) || isPending(selected)}>Assign project manager</Button>
    </div> : <p className="text-xs text-muted-foreground">Only workspace managers can grant or remove management access.</p>}
  </CardContent></Card>;
}
