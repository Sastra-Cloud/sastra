"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  replacePlanTemplateStructure,
  setDefaultPlanTemplate,
  updatePlanTemplate,
} from "@/lib/projects/template-actions";

type TaskDraft = {
  name: string;
  description: string;
  roleId: string | null;
  offsetDays: number | null;
  isPerUnit: boolean;
};
type PhaseDraft = {
  name: string;
  color: string | null;
  durationDays: number | null;
  tasks: TaskDraft[];
};
type Template = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  phases: Array<{
    name: string;
    color: string | null;
    defaultDurationDays: number | null;
    tasks: Array<{
      name: string;
      description: string | null;
      defaultProjectRoleId: string | null;
      defaultOffsetDays: number | null;
      isPerUnit: boolean;
    }>;
  }>;
};

const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function TemplateRow({
  template,
  roles,
  isDefault,
}: {
  template: Template;
  roles: Array<{ id: string; label: string }>;
  isDefault: boolean;
}) {
  const [metaPending, startMeta] = useTransition();
  const [structurePending, startStructure] = useTransition();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [active, setActive] = useState(template.isActive);
  const [phases, setPhases] = useState<PhaseDraft[]>(() =>
    template.phases.map((phase) => ({
      name: phase.name,
      color: phase.color,
      durationDays: phase.defaultDurationDays,
      tasks: phase.tasks.map((task) => ({
        name: task.name,
        description: task.description ?? "",
        roleId: task.defaultProjectRoleId,
        offsetDays: task.defaultOffsetDays,
        isPerUnit: task.isPerUnit,
      })),
    }))
  );

  const updatePhase = (index: number, patch: Partial<PhaseDraft>) =>
    setPhases((current) => current.map((phase, i) => i === index ? { ...phase, ...patch } : phase));
  const updateTask = (phaseIndex: number, taskIndex: number, patch: Partial<TaskDraft>) =>
    setPhases((current) => current.map((phase, i) => i === phaseIndex ? {
      ...phase,
      tasks: phase.tasks.map((task, j) => j === taskIndex ? { ...task, ...patch } : task),
    } : phase));

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Template name</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>Description</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />Available when creating projects</label>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {template.key ? (
              <Button
                type="button"
                variant={isDefault ? "secondary" : "outline"}
                disabled={isDefault || metaPending}
                onClick={() => startMeta(async () => {
                  const result = await setDefaultPlanTemplate(template.key);
                  if (result.error) toast.error(result.error); else toast.success("Default project template updated");
                })}
              ><Star className="size-4" />{isDefault ? "Workspace default" : "Make default"}</Button>
            ) : null}
            <Button type="button" disabled={metaPending || !name.trim()} onClick={() => startMeta(async () => {
              const result = await updatePlanTemplate({ id: template.id, name, description, isActive: active });
              if (result.error) toast.error(result.error); else toast.success("Template saved");
            })}>{metaPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save details</Button>
          </div>
        </div>

        <details className="group rounded-xl border bg-muted/15 p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
            <span>{phases.length} phase{phases.length === 1 ? "" : "s"} · {phases.reduce((total, phase) => total + phase.tasks.length, 0)} tasks</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 space-y-4">
            {phases.map((phase, phaseIndex) => (
              <section key={phaseIndex} className="space-y-3 rounded-xl border bg-background p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_auto] sm:items-end">
                  <div className="grid gap-1"><Label>Phase</Label><Input value={phase.name} onChange={(event) => updatePhase(phaseIndex, { name: event.target.value })} /></div>
                  <div className="grid gap-1"><Label>Duration (days)</Label><Input type="number" min={0} value={phase.durationDays ?? ""} onChange={(event) => updatePhase(phaseIndex, { durationDays: event.target.value ? Number(event.target.value) : null })} /></div>
                  <div className="grid gap-1"><Label>Color</Label><Input type="color" value={phase.color ?? "#64748b"} onChange={(event) => updatePhase(phaseIndex, { color: event.target.value })} /></div>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${phase.name}`} onClick={() => setPhases((current) => current.filter((_, i) => i !== phaseIndex))}><Trash2 className="size-4" /></Button>
                </div>
                <div className="space-y-2">
                  {phase.tasks.map((task, taskIndex) => (
                    <div key={taskIndex} className="grid gap-2 rounded-lg bg-muted/25 p-2 sm:grid-cols-[minmax(0,1fr)_10rem_6rem_auto_auto] sm:items-end">
                      <div className="grid gap-1"><Label>Task</Label><Input value={task.name} onChange={(event) => updateTask(phaseIndex, taskIndex, { name: event.target.value })} /></div>
                      <div className="grid gap-1"><Label>Role</Label><select className={selectClass} value={task.roleId ?? ""} onChange={(event) => updateTask(phaseIndex, taskIndex, { roleId: event.target.value || null })}><option value="">No default</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></div>
                      <div className="grid gap-1"><Label>Offset</Label><Input type="number" value={task.offsetDays ?? ""} onChange={(event) => updateTask(phaseIndex, taskIndex, { offsetDays: event.target.value ? Number(event.target.value) : null })} /></div>
                      <label className="flex min-h-9 items-center gap-2 text-xs"><input type="checkbox" checked={task.isPerUnit} onChange={(event) => updateTask(phaseIndex, taskIndex, { isPerUnit: event.target.checked })} />Per unit</label>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${task.name}`} onClick={() => updatePhase(phaseIndex, { tasks: phase.tasks.filter((_, i) => i !== taskIndex) })}><Trash2 className="size-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => updatePhase(phaseIndex, { tasks: [...phase.tasks, { name: "New task", description: "", roleId: null, offsetDays: 0, isPerUnit: false }] })}><Plus className="size-4" />Add task</Button>
                </div>
              </section>
            ))}
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setPhases((current) => [...current, { name: "New phase", color: "#64748b", durationDays: 7, tasks: [] }])}><Plus className="size-4" />Add phase</Button>
              <Button type="button" disabled={structurePending || !phases.length} onClick={() => startStructure(async () => {
                const result = await replacePlanTemplateStructure({ templateId: template.id, phases });
                if (result.error) toast.error(result.error); else toast.success("Template workflow saved");
              })}>{structurePending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save phases & tasks</Button>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function TemplatesManager({
  templates,
  roles,
  defaultTemplateKey,
}: {
  templates: Template[];
  roles: Array<{ id: string; label: string }>;
  defaultTemplateKey: string | null;
}) {
  return (
    <div className="space-y-4">
      <div><h2 className="font-heading text-2xl font-semibold">Project templates</h2><p className="text-sm text-muted-foreground">Control the workflows offered for new projects. Existing projects are unaffected.</p></div>
      {templates.map((template) => <TemplateRow key={template.id} template={template} roles={roles} isDefault={template.key === defaultTemplateKey} />)}
    </div>
  );
}
