"use client";


import { useDraftField, useProjectDraft } from "./project-draft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_KIND_LABELS,
  PROJECT_KINDS,
  isEpisodicKind,
  projectUnitTerms,
  VIDEO_PRODUCTION_MODE_LABELS,
  VIDEO_PRODUCTION_MODES,
  type ProjectKind,
} from "@/lib/projects/kinds";
import {
  PRINT_FUNDING_LABELS,
  PRINT_FUNDING_STATUSES,
} from "@/lib/projects/print-funding";

type Template = {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";


export function NewProjectForm({
  templates,
  defaultPlanTemplateKey,
}: {
  templates: Template[];
  defaultSourceLanguage: string | null;
  defaultTargetLanguage: string | null;
  defaultPlanTemplateKey: string | null;
}) {
  const { draft, setDraft, state, action, pending } = useProjectDraft();
  const [kind, setKind] = useDraftField("kind");
  const [planTemplateId, setPlanTemplateId] = useDraftField("planTemplateId");
  const units = projectUnitTerms(kind);
  const compatibleTemplates = templates.filter(
    (template) => !template.key || template.key.startsWith(`${kind}-`)
  );
  const selectedTemplate = templates.find(
    (template) => template.id === planTemplateId
  );

  const changeKind = (next: ProjectKind) => {
    setKind(next);
    const configured = templates.find(
      (template) => template.key === defaultPlanTemplateKey
    );
    const preferredKey = configured?.key?.startsWith(`${next}-`)
      ? configured.key
      : next === "book"
        ? "book-translation"
        : next === "article"
          ? "article-translation"
          : next === "podcast"
            ? "podcast-production"
            : null;
    setPlanTemplateId(
      templates.find((template) => template.key === preferredKey)?.id ?? "none"
    );
  };

  return (
    <form action={action} className="grid max-w-2xl gap-5">
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required autoFocus value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
      </div>

      {kind === "video_series" ? (
        <div className="grid gap-2">
          <Label htmlFor="videoProductionMode">Video production mode</Label>
          <select
            id="videoProductionMode"
            name="videoProductionMode"
            className={selectClass}
           value={draft.videoProductionMode} onChange={event => setDraft(current => ({ ...current, videoProductionMode: event.target.value }))}>
            {VIDEO_PRODUCTION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {VIDEO_PRODUCTION_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Original videos develop a concept and script. Translation videos begin with
            script translation and approval. Both then move through video production,
            review, and publishing.
          </p>
        </div>
      ) : null}

      {!isEpisodicKind(kind) ? <div className="grid gap-2">
        <Label htmlFor="description">Goal / description</Label>
        <Textarea id="description" name="description" rows={3} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} />
        <p className="text-xs text-muted-foreground">
          State the clear done condition for this work, then add context.
        </p>
      </div> : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Standard production tasks and dependencies will be created for every {units.singular}
          listed below.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="kind">Project type</Label>
          <select
            id="kind"
            name="kind"
            className={selectClass}
            value={kind}
            onChange={(event) => changeKind(event.target.value as ProjectKind)}
          >
            {PROJECT_KINDS.map((value) => (
              <option key={value} value={value}>
                {PROJECT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" className={selectClass} value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))}>
            <option value="proposal">Proposal</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" name="priority" className={selectClass} value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      {kind === "book" ? (
        <div className="grid gap-2">
          <Label htmlFor="printFundingStatus">Print plan and funding</Label>
          <select
            id="printFundingStatus"
            name="printFundingStatus"
            className={selectClass}
           value={draft.printFundingStatus} onChange={event => setDraft(current => ({ ...current, printFundingStatus: event.target.value }))}>
            {PRINT_FUNDING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PRINT_FUNDING_LABELS[status]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Say whether printing is part of the current plan. This can change
            later without changing the formats covered by Rights.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sourceLanguage">Source language</Label>
          <Input id="sourceLanguage" name="sourceLanguage" value={draft.sourceLanguage} onChange={event => setDraft(current => ({ ...current, sourceLanguage: event.target.value }))} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="targetLanguage">Target language</Label>
          <Input id="targetLanguage" name="targetLanguage" value={draft.targetLanguage} onChange={event => setDraft(current => ({ ...current, targetLanguage: event.target.value }))} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" value={draft.startDate} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value }))} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" name="dueDate" type="date" value={draft.dueDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))} />
        </div>
      </div>

      {!isEpisodicKind(kind) ? (
        <div className="grid gap-2">
          <Label htmlFor="planTemplateId">Plan template</Label>
          <select
            id="planTemplateId"
            name="planTemplateId"
            className={selectClass}
            value={planTemplateId}
            onChange={(event) => setPlanTemplateId(event.target.value)}
          >
            <option value="none">Blank — no phases/tasks</option>
            {compatibleTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {selectedTemplate?.description ??
              "Blank projects keep the units above but do not create phases or tasks."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="chapters">
          {units.plural[0].toUpperCase() + units.plural.slice(1)} (optional)
        </Label>
        <Textarea
          id="chapters"
          name="chapters"
          rows={3}
          placeholder={`One per line, e.g.\n${
            kind === "article"
              ? "Article 1\nArticle 2"
              : kind === "podcast"
                ? "Episode 1\nEpisode 2"
                : kind === "video_series"
                  ? "Video 1\nVideo 2"
                : kind === "book"
                  ? "Chapter 1\nChapter 2"
                  : "Unit 1\nUnit 2"
          }`}
        value={draft.chapters} onChange={event => setDraft(current => ({ ...current, chapters: event.target.value }))} />
        <p className="text-xs text-muted-foreground">
          {isEpisodicKind(kind)
            ? `The standard ${units.singular} workflow is created for every item listed here.`
            : `Per-${units.singular} template tasks fan out once for every ${units.singular} listed here.`}
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
