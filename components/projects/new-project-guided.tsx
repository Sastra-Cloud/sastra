"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { createProject, type ProjectFormState } from "@/lib/projects/actions";
import { GuidedSteps, type GuidedStep } from "@/components/guidance/guided-steps";
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

const initial: ProjectFormState = {};

function preferredTemplateIdForKind(
  templates: Template[],
  kind: ProjectKind,
  defaultPlanTemplateKey: string | null
): string {
  const configured = templates.find((t) => t.key === defaultPlanTemplateKey);
  const preferredKey = configured?.key?.startsWith(`${kind}-`)
    ? configured.key
    : kind === "book"
      ? "book-translation"
      : kind === "article"
        ? "article-translation"
        : kind === "podcast"
          ? "podcast-production"
          : null;
  return templates.find((t) => t.key === preferredKey)?.id ?? "none";
}

/**
 * Guided, step-by-step version of the new-project form. It is one real form with
 * the same field names as {@link NewProjectForm}, so it submits an identical
 * payload to the same `createProject` action — only the layout differs. Skipping
 * hands the user to the single-page form via `onUseForm`.
 */
export function NewProjectGuided({
  templates,
  defaultSourceLanguage,
  defaultTargetLanguage,
  defaultPlanTemplateKey,
  onUseForm,
}: {
  templates: Template[];
  defaultSourceLanguage: string | null;
  defaultTargetLanguage: string | null;
  defaultPlanTemplateKey: string | null;
  onUseForm: () => void;
}) {
  const [state, action, pending] = useActionState(createProject, initial);
  const formRef = useRef<HTMLFormElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ProjectKind>("book");
  const [videoProductionMode, setVideoProductionMode] = useState("original");
  const [status, setStatus] = useState("planning");
  const [priority, setPriority] = useState("medium");
  const [printFundingStatus, setPrintFundingStatus] = useState("not_assessed");
  const [sourceLanguage, setSourceLanguage] = useState(defaultSourceLanguage ?? "");
  const [targetLanguage, setTargetLanguage] = useState(defaultTargetLanguage ?? "");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [planTemplateId, setPlanTemplateId] = useState(() =>
    preferredTemplateIdForKind(templates, "book", defaultPlanTemplateKey)
  );
  const [chapters, setChapters] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const units = projectUnitTerms(kind);
  const episodic = isEpisodicKind(kind);
  const compatibleTemplates = templates.filter(
    (t) => !t.key || t.key.startsWith(`${kind}-`)
  );
  const selectedTemplate = templates.find((t) => t.id === planTemplateId);

  const changeKind = (next: ProjectKind) => {
    setKind(next);
    setPlanTemplateId(
      preferredTemplateIdForKind(templates, next, defaultPlanTemplateKey)
    );
  };

  const chapterList = chapters
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const steps: GuidedStep[] = [
    {
      key: "about",
      label: "About",
      hint: "Name and type",
      canContinue: title.trim().length > 0,
      content: (
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="title">What is this project called?</Label>
            <Input
              id="title"
              name="title"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`e.g. The Gospel of John${targetLanguage ? ` — ${targetLanguage}` : ""}`}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kind">What kind of project is it?</Label>
            <select
              id="kind"
              name="kind"
              className={selectClass}
              value={kind}
              onChange={(e) => changeKind(e.target.value as ProjectKind)}
            >
              {PROJECT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {PROJECT_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {kind === "video_series" ? (
            <div className="grid gap-2">
              <Label htmlFor="videoProductionMode">Video production mode</Label>
              <select
                id="videoProductionMode"
                name="videoProductionMode"
                className={selectClass}
                value={videoProductionMode}
                onChange={(e) => setVideoProductionMode(e.target.value)}
              >
                {VIDEO_PRODUCTION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {VIDEO_PRODUCTION_MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {episodic ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Standard {units.singular} tasks are created for every {units.singular}{" "}
              you list in the next step.
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="description">What does done look like? (optional)</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Write the clear finish condition for this work, then add context.
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "content",
      label: "Languages",
      hint: `Languages and ${units.plural}`,
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sourceLanguage">Translate from (source language)</Label>
              <Input
                id="sourceLanguage"
                name="sourceLanguage"
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="targetLanguage">Translate into (target language)</Label>
              <Input
                id="targetLanguage"
                name="targetLanguage"
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="chapters">
              {units.plural[0].toUpperCase() + units.plural.slice(1)} (optional)
            </Label>
            <Textarea
              id="chapters"
              name="chapters"
              rows={4}
              value={chapters}
              onChange={(e) => setChapters(e.target.value)}
              placeholder={`One per line, for example:\n${
                kind === "article"
                  ? "Why Scripture Matters\nHow to Read the Psalms"
                  : kind === "podcast"
                    ? "Episode 1\nEpisode 2"
                    : kind === "video_series"
                      ? "Video 1\nVideo 2"
                      : kind === "book"
                        ? "Chapter 1\nChapter 2"
                        : "Unit 1\nUnit 2"
              }`}
            />
            <p className="text-xs text-muted-foreground">
              {episodic
                ? `The standard ${units.singular} workflow is created for every item here.`
                : `Template tasks marked per-${units.singular} repeat once for every ${units.singular} here.`}
              {chapterList.length > 0
                ? ` ${chapterList.length} ${units.singular}${chapterList.length === 1 ? "" : "s"} so far.`
                : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      label: "Dates & plan",
      hint: "Schedule and template",
      content: (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="startDate">Start date (optional)</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dueDate">Due date (optional)</Label>
              <Input
                id="dueDate"
                name="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          {!episodic ? (
            <div className="grid gap-2">
              <Label htmlFor="planTemplateId">Plan template</Label>
              <select
                id="planTemplateId"
                name="planTemplateId"
                className={selectClass}
                value={planTemplateId}
                onChange={(e) => setPlanTemplateId(e.target.value)}
              >
                <option value="none">Blank — no stages or tasks</option>
                {compatibleTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {selectedTemplate?.description ??
                  "A blank project keeps the units above but creates no stages or tasks."}
              </p>
            </div>
          ) : null}
          {kind === "book" ? (
            <div className="grid gap-2">
              <Label htmlFor="printFundingStatus">Print plan and funding</Label>
              <select
                id="printFundingStatus"
                name="printFundingStatus"
                className={selectClass}
                value={printFundingStatus}
                onChange={(e) => setPrintFundingStatus(e.target.value)}
              >
                {PRINT_FUNDING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PRINT_FUNDING_LABELS[s]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Say whether printing is part of the current plan. You can change
                this later.
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Advanced options
              <ChevronDown
                className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
            </button>
            {advancedOpen ? (
              <div className="grid gap-4 border-t px-3 py-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    className={selectClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="proposal">Proposal</option>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="priority">Priority</Label>
                  <select
                    id="priority"
                    name="priority"
                    className={selectClass}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "review",
      label: "Review",
      hint: "Check and create",
      nextLabel: "Create project",
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Check your answers, then create the project. You can edit everything
            afterward.
          </p>
          <dl className="divide-y rounded-lg border text-sm">
            <ReviewRow label="Name" value={title || "—"} />
            <ReviewRow label="Type" value={PROJECT_KIND_LABELS[kind]} />
            {!episodic && description ? (
              <ReviewRow label="Goal" value={description} />
            ) : null}
            <ReviewRow
              label="Languages"
              value={
                sourceLanguage || targetLanguage
                  ? `${sourceLanguage || "—"} → ${targetLanguage || "—"}`
                  : "Not set"
              }
            />
            <ReviewRow
              label={units.plural[0].toUpperCase() + units.plural.slice(1)}
              value={
                chapterList.length
                  ? `${chapterList.length} listed`
                  : "None yet"
              }
            />
            <ReviewRow
              label="Dates"
              value={
                startDate || dueDate
                  ? `${startDate || "—"} to ${dueDate || "—"}`
                  : "Not set"
              }
            />
            {!episodic ? (
              <ReviewRow
                label="Plan template"
                value={selectedTemplate?.name ?? "Blank"}
              />
            ) : null}
            {kind === "book" ? (
              <ReviewRow
                label="Printing"
                value={
                  PRINT_FUNDING_LABELS[
                    printFundingStatus as (typeof PRINT_FUNDING_STATUSES)[number]
                  ]
                }
              />
            ) : null}
          </dl>
        </div>
      ),
    },
  ];

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <GuidedSteps
        steps={steps}
        keepMounted
        finishing={pending}
        onFinish={() => formRef.current?.requestSubmit()}
        onSkip={onUseForm}
        skipLabel="Fill in everything on one page"
      />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-3 py-2">
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-pretty text-foreground">{value}</dd>
    </div>
  );
}
