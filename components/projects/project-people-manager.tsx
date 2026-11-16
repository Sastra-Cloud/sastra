"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addProjectPerson, removeProjectPerson } from "@/lib/projects/people-actions";
import { addProjectMember, removeProjectMember } from "@/lib/projects/member-actions";
import { confirmDialog } from "@/lib/dialog-requests";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Label } from "@/components/ui/label";

type WorkRole = { id: string; roleId: string; label: string };
type Person = { id: string; name: string; image: string | null; manager: boolean; admin: boolean; roles: WorkRole[] };
type Change = { kind: "add"; person: Person } | { kind: "remove"; id: string }
  | { kind: "role-add"; id: string; role: WorkRole } | { kind: "role-remove"; id: string; roleId: string };
const key = (change: Change) => change.kind === "add" ? change.person.id : change.id;
function update(people: Person[], change: Change): Person[] {
  if (change.kind === "add") return [...people.filter(p => p.id !== change.person.id), change.person].sort((a, b) => a.name.localeCompare(b.name));
  if (change.kind === "remove") return people.filter(p => p.id !== change.id);
  return people.map(p => p.id !== change.id ? p : { ...p, roles: change.kind === "role-add"
    ? [...p.roles, change.role] : p.roles.filter(role => role.id !== change.roleId) });
}
const selectClass = "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9";

export function ProjectPeopleManager({ projectId, canEdit, people, candidates, roles, capacityByUser = {} }: {
  projectId: string; canEdit: boolean; people: Person[];
  candidates: { id: string; name: string; image: string | null; role: string }[];
  roles: { id: string; label: string }[];
  capacityByUser?: Record<string, { roles: { roleId: string; used: number; capacity: number }[] }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const { state: visible, pending, isPending, run } = useOptimisticAction({ state: people, update, getKey: key });
  const available = candidates.filter(p => !visible.some(member => member.id === p.id));
  const filtered = visible.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  async function add() {
    const person = available.find(p => p.id === selected);
    if (!person || isPending(person.id)) return;
    if (!(await confirmDialog(`Add ${person.name} to this project? They will be able to read all project chat history and shared chat files, send messages, and receive mentions.`))) return;
    run({ kind: "add", person: { ...person, admin: ["admin", "super_admin"].includes(person.role), manager: false, roles: [] } },
      () => addProjectPerson(projectId, person.id), { onSuccess: () => { setSelected(current => current === person.id ? "" : current); router.refresh(); } });
  }

  async function remove(person: Person) {
    if (isPending(person.id)) return;
    if (!(await confirmDialog(`Remove ${person.name} from this project? They will lose project chat and chat-file access. Their work roles will be removed; assigned tasks will stay assigned.`))) return;
    run({ kind: "remove", id: person.id }, () => removeProjectPerson(projectId, person.id), { onSuccess: () => router.refresh() });
  }

  function addRole(person: Person, roleId: string) {
    const role = roles.find(r => r.id === roleId);
    if (!role || isPending(person.id)) return;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    run({ kind: "role-add", id: person.id, role: { id: temporaryId, roleId, label: role.label } },
      () => addProjectMember(projectId, person.id, roleId), {
        reconcile: (saved, current) => current.map(p => p.id !== person.id ? p : { ...p, roles: p.roles.map(r => r.id === temporaryId && saved?.id ? { ...r, id: saved.id } : r) }),
        onSuccess: () => { setSelectedRoles(current => ({ ...current, [person.id]: current[person.id] === roleId ? "" : current[person.id] })); router.refresh(); },
      });
  }

  async function removeRole(person: Person, role: WorkRole) {
    if (!(await confirmDialog(`Remove ${person.name}'s ${role.label} work role? They will stay in the project and its chats.`))) return;
    run({ kind: "role-remove", id: person.id, roleId: role.id }, () => removeProjectMember(role.id), { onSuccess: () => router.refresh() });
  }

  return <section className="space-y-4" aria-labelledby="project-people-heading" aria-busy={pending}>
    <div className="space-y-1">
      <h2 id="project-people-heading" className="text-lg font-semibold">People <span className="text-muted-foreground">({visible.length})</span></h2>
      <p className="text-sm text-muted-foreground">These people can use every project chat. Work roles are optional. Workspace admins can access every project for oversight.</p>
    </div>
    {canEdit ? <div id="add-people" className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-sm font-medium">Add people</h3>
      <div className="flex flex-col items-end gap-3 sm:flex-row">
        <div className="w-full min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="project-person">Teammate</Label>
          <select id="project-person" className={selectClass} value={available.some(p => p.id === selected) ? selected : ""} onChange={e => setSelected(e.target.value)}>
            <option value="">{available.length ? "Choose a teammate…" : "Everyone is already in this project"}</option>
            {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <Button className="min-h-11 w-full sm:min-h-9 sm:w-auto" disabled={!selected || isPending(selected)} onClick={add}>Add to project</Button>
      </div>
      <p className="text-xs text-muted-foreground">Adding someone gives access to existing chat history and files. It does not grant management or finance permissions.</p>
    </div> : <p className="text-sm text-muted-foreground">Ask a project manager or workspace admin to add people.</p>}
    <div className="space-y-1.5">
      <Label htmlFor="find-project-person">Find a person</Label>
      <input id="find-project-person" type="search" className={selectClass} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search project people…" />
    </div>
    <span className="sr-only" role="status">{pending ? "Saving project people…" : ""}</span>
    <ul className="divide-y rounded-xl border bg-card">
      {filtered.map(person => <li key={person.id} className="space-y-3 p-4" aria-busy={isPending(person.id)}>
        <div className="flex items-start gap-3">
          <UserAvatar name={person.name} image={person.image} size="sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="break-words text-sm font-medium">{person.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {person.admin ? <Badge variant="secondary">Workspace admin</Badge> : person.manager ? <Badge variant="secondary">Project manager</Badge> : <Badge variant="outline">Project member</Badge>}
              {person.roles.map(role => <span key={role.id} className="inline-flex max-w-full items-center rounded-md border px-2 text-xs">
                <span className="break-words">{role.label}</span>
                {canEdit ? <Button variant="ghost" size="icon-sm" className="ml-1 size-11 shrink-0 sm:size-7" aria-label={`Remove ${role.label} role for ${person.name}`} disabled={isPending(person.id)} onClick={() => removeRole(person, role)}><X className="size-3" /></Button> : null}
              </span>)}
              {person.roles.length === 0 ? <span className="text-xs text-muted-foreground">No work role assigned</span> : null}
            </div>
            {isPending(person.id) ? <p role="status" className="text-xs text-muted-foreground">Saving…</p> : null}
          </div>
          {canEdit && !person.admin && !person.manager ? <Button variant="ghost" className="min-h-11 shrink-0 sm:min-h-9" disabled={isPending(person.id)} onClick={() => remove(person)}>Remove</Button> : null}
        </div>
        {canEdit ? <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 text-muted-foreground sm:min-h-9">Assign a work role</summary>
          <div className="flex flex-col gap-2 sm:flex-row"><select className={selectClass} aria-label={`Add work role for ${person.name}`} value={selectedRoles[person.id] ?? ""} disabled={isPending(person.id)} onChange={e => setSelectedRoles(current => ({ ...current, [person.id]: e.target.value }))}>
            <option value="">Choose an optional work role…</option>
            {roles.filter(role => !person.roles.some(assigned => assigned.roleId === role.id)).map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select><Button variant="outline" className="min-h-11 shrink-0 sm:min-h-9" disabled={isPending(person.id) || !selectedRoles[person.id]} onClick={() => addRole(person, selectedRoles[person.id])}>Assign role</Button></div>
          {selectedRoles[person.id] ? (() => {
            const capacity = capacityByUser[person.id]?.roles.find(role => role.roleId === selectedRoles[person.id]);
            return <p className={`mt-2 text-xs ${capacity && capacity.used >= capacity.capacity ? "text-destructive" : "text-muted-foreground"}`}>{capacity ? `${capacity.used} of ${capacity.capacity} projects in this role${capacity.used >= capacity.capacity ? " — already at capacity." : " — has room."}` : "No capacity is set for this person in this role. Ask a workspace manager to check their workload."}</p>;
          })() : null}
        </details> : null}
      </li>)}
      {filtered.length === 0 ? <li className="p-4 text-sm text-muted-foreground">{visible.length ? "No people match your search." : "No people have been added yet. Add teammates to start project conversations."}</li> : null}
    </ul>
  </section>;
}
