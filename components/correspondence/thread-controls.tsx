"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  assignThread,
  acceptCounterpartySuggestion,
  acceptGrantReminder,
  createProjectFromThread,
  dismissCounterpartySuggestion,
  dismissGrantReminder,
  linkThreadProject,
  reprocessThread,
  setThreadStatus,
  unlinkThreadProject,
} from "@/lib/email/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { usePropState } from "@/hooks/use-prop-state";
import { describeReprocessResult } from "@/components/correspondence/reprocess-feedback";

const NONE = "__none__";
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  waiting: "Waiting",
  done: "Done",
};

const replaceValue = (_current: string, next: string) => next;

type Option = { id: string; label: string };
type FundingPartnerOption = Option & { contactEmails: string[] };
type ProjectKind =
  | "book"
  | "article"
  | "podcast"
  | "video_series"
  | "other";
type ThreadProject = {
  id: string;
  slug: string;
  title: string;
  linkedManually: boolean;
};
type CounterpartySuggestion = {
  notificationId: string;
  type: "rights_holder" | "funding_partner" | "printer";
  name: string;
  contactName: string;
  email: string;
  confidence: number;
  reason: string;
  existingId: string | null;
  organizationId: string | null;
  organizationName: string;
  organizationAction: "existing" | "create";
  contactAction: "existing" | "create" | "none";
};
type ReminderCadence = "one_off" | "monthly" | "quarterly" | "annual";
type GrantReminderSuggestion = {
  notificationId: string;
  reminders: Array<{
    title: string;
    detail: string;
    dueDate: string | null;
    recurring: boolean;
    cadence: ReminderCadence;
  }>;
  targetProjects: Array<{ id: string; title: string }>;
};

const CADENCE_LABEL: Record<ReminderCadence, string> = {
  one_off: "One-off",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function titleFromSubject(subject: string | null) {
  return subject?.replace(/^(?:(?:re|fw|fwd)\s*:\s*)+/i, "").trim() ?? "";
}

export function ThreadControls({
  threadId,
  subject,
  counterpartySuggestion,
  grantReminderSuggestion,
  status,
  threadProjects,
  assigneeId,
  projects,
  users,
  fundingPartners,
}: {
  threadId: string;
  subject: string | null;
  counterpartySuggestion: CounterpartySuggestion | null;
  grantReminderSuggestion: GrantReminderSuggestion | null;
  status: "open" | "waiting" | "done";
  threadProjects: ThreadProject[];
  assigneeId: string | null;
  projects: Option[];
  users: Option[];
  fundingPartners: FundingPartnerOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const statusMutation = useOptimisticAction({ state: status as string, update: replaceValue });
  const ownerMutation = useOptimisticAction({ state: assigneeId ?? NONE, update: replaceValue });

  const onStatus = (v: string | null) => {
    const val = v ?? "open";
    statusMutation.run(val, () => setThreadStatus(threadId, val), {
      errorMessage: "Could not update the thread status.",
      onSuccess: () => router.refresh(),
    });
  };
  const onOwner = (v: string | null) => {
    const val = v ?? NONE;
    ownerMutation.run(val, () => assignThread(threadId, val === NONE ? null : val), {
      errorMessage: "Could not update the assignee.",
    });
  };
  const onReprocess = () => {
    start(async () => {
      try {
        const res = await reprocessThread(threadId);
        if (res?.error) {
          toast.error(res.error);
          return;
        }
        const feedback = describeReprocessResult(res, "thread");
        const toastOptions = {
          description: feedback.description,
          ...(feedback.destination === "thread-review"
            ? {
                action: {
                  label: "Review",
                  onClick: () =>
                    document
                      .getElementById("correspondence-review-results")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                },
              }
            : {}),
        };
        if (feedback.tone === "success") {
          toast.success(feedback.title, toastOptions);
        } else {
          toast.info(feedback.title, toastOptions);
        }
        router.refresh();
      } catch {
        toast.error("Could not reprocess this thread. Please try again.");
      }
    });
  };

  const labelFor = (opts: Option[], v: string | null, empty: string) =>
    !v || v === NONE ? empty : opts.find((o) => o.id === v)?.label ?? empty;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select value={statusMutation.state} onValueChange={onStatus} disabled={statusMutation.pending}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v: string | null) => STATUS_LABEL[v ?? ""] ?? "Status"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="waiting">Waiting</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 sm:col-span-2 sm:row-span-2">
        <Label className="text-xs text-muted-foreground">Projects</Label>
        <ThreadProjectLinks
          threadId={threadId}
          subject={subject}
          threadProjects={threadProjects}
          projects={projects}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Owner</Label>
        <Select value={ownerMutation.state} onValueChange={onOwner} disabled={ownerMutation.pending}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v: string | null) => labelFor(users, v, "Unassigned")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Unassigned</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {counterpartySuggestion ? (
        <CounterpartySuggestionCard
          suggestion={counterpartySuggestion}
          fundingPartners={fundingPartners}
        />
      ) : null}

      {grantReminderSuggestion ? (
        <ReminderSuggestionCard suggestion={grantReminderSuggestion} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReprocess}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {pending ? "Reprocessing…" : "Reprocess thread"}
        </Button>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Re-checks forwarded context, project and counterparty links, AI
          suggestions, rights documents, receipts, print proofs, and quote text. It does not send email.
        </p>
      </div>
    </div>
  );
}

function CounterpartySuggestionCard({
  suggestion,
  fundingPartners,
}: {
  suggestion: CounterpartySuggestion;
  fundingPartners: FundingPartnerOption[];
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [pending, startTransition] = useTransition();
  const [selectedPartnerId, setSelectedPartnerId] = useState(
    suggestion.organizationId ?? NONE
  );
  if (!visible) return null;

  const typeLabel = {
    rights_holder: "rights holder / publisher",
    funding_partner: "funding partner",
    printer: "printer",
  }[suggestion.type];
  const isFundingPartner = suggestion.type === "funding_partner";
  const selectedPartner = fundingPartners.find(
    (partner) => partner.id === selectedPartnerId
  );
  const usesAutomaticMatch = selectedPartnerId === NONE;
  const organizationIsExisting = isFundingPartner
    ? !!selectedPartner ||
      (usesAutomaticMatch && suggestion.organizationAction === "existing")
    : suggestion.organizationAction === "existing";
  const organizationName = selectedPartner?.label ?? suggestion.organizationName;
  const selectedContactAction =
    isFundingPartner && selectedPartner && suggestion.email
      ? selectedPartner.contactEmails.some(
          (email) => email.toLowerCase() === suggestion.email.toLowerCase()
        )
        ? "existing"
        : "create"
      : suggestion.contactAction;
  const contactLabel = [suggestion.contactName, suggestion.email]
    .filter(Boolean)
    .join(" · ");
  const actionLabel = isFundingPartner
    ? !organizationIsExisting
      ? "Create partner & link"
      : selectedContactAction === "create"
        ? "Add contact & link"
        : selectedContactAction === "existing"
          ? "Link partner & contact"
          : "Link existing partner"
    : suggestion.existingId
      ? `Link ${typeLabel}`
      : `Create ${typeLabel} & link`;
  const outcomeText = isFundingPartner
    ? !organizationIsExisting
      ? selectedContactAction === "create"
        ? `Approving will create ${organizationName}, add ${suggestion.contactName || suggestion.email} as a contact, and link this email thread.`
        : `Approving will create ${organizationName} and link this email thread.`
      : selectedContactAction === "create"
        ? `Approving will add ${suggestion.contactName || suggestion.email} to ${organizationName} and link this email thread.`
        : selectedContactAction === "existing"
          ? `Approving will link the saved partner and contact to this email thread.`
          : `Approving will link the saved partner to this email thread.`
    : null;

  const accept = () => {
    setVisible(false);
    startTransition(async () => {
      try {
        const result = await acceptCounterpartySuggestion(
          suggestion.notificationId,
          isFundingPartner && selectedPartnerId !== NONE
            ? selectedPartnerId
            : undefined
        );
        if (result.error) throw new Error(result.error);
        toast.success(
          result.message ?? `Linked ${result.label ?? suggestion.name}.`
        );
        router.refresh();
      } catch (error) {
        setVisible(true);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not apply the counterparty suggestion."
        );
      }
    });
  };

  const dismiss = () => {
    setVisible(false);
    startTransition(async () => {
      try {
        await dismissCounterpartySuggestion(suggestion.notificationId);
        router.refresh();
      } catch {
        setVisible(true);
        toast.error("Could not dismiss the suggestion.");
      }
    });
  };

  return (
    <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-3 sm:col-span-3">
      <div className="flex items-start gap-3 pr-8">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <Building2 className="size-3.5 text-muted-foreground" />
            {isFundingPartner
              ? "AI found a possible funding partner"
              : `AI suggests ${typeLabel}: ${suggestion.name}`}
          </p>
          <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
          {isFundingPartner ? (
            <div className="space-y-1.5 py-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="w-20 text-muted-foreground">Organization</span>
                <span className="font-medium text-foreground">
                  {organizationName}
                </span>
                <Badge variant="outline">
                  {organizationIsExisting ? "Existing partner" : "New partner"}
                </Badge>
              </div>
              {contactLabel ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="w-20 text-muted-foreground">Contact</span>
                  <span className="font-medium text-foreground">{contactLabel}</span>
                  <Badge variant="outline">
                    {selectedContactAction === "existing"
                      ? "Existing contact"
                      : selectedContactAction === "create"
                        ? "New contact"
                        : "Not saved"}
                  </Badge>
                </div>
              ) : null}
              <p className="pt-0.5 text-muted-foreground">{outcomeText}</p>
              <div className="max-w-sm pt-1">
                <Label
                  htmlFor={`funding-partner-${suggestion.notificationId}`}
                  className="sr-only"
                >
                  Funding partner record
                </Label>
                <Select
                  value={selectedPartnerId}
                  onValueChange={(value) => setSelectedPartnerId(value ?? NONE)}
                  disabled={pending}
                >
                  <SelectTrigger
                    id={`funding-partner-${suggestion.notificationId}`}
                    size="sm"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>
                      {suggestion.organizationAction === "existing"
                        ? `Use suggested partner: ${suggestion.organizationName}`
                        : `Create new partner: ${suggestion.name}`}
                    </SelectItem>
                    {fundingPartners.map((partner) => (
                      <SelectItem key={partner.id} value={partner.id}>
                        Use existing partner: {partner.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : suggestion.contactName || suggestion.email ? (
            <p className="text-xs text-muted-foreground">{contactLabel}</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="mt-1"
            disabled={pending}
            onClick={accept}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {actionLabel}
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss counterparty suggestion"
        className="absolute right-2 top-2"
        disabled={pending}
        onClick={dismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Review card for an AI-detected grant reminder: the manager edits the due date,
 * picks which of the grant's projects it applies to, then Approves — only then
 * does the server create a dated task (one-off) or a recurring grant obligation
 * on each selected project. Nothing is created until Approve; Dismiss discards it.
 */
function ReminderSuggestionCard({
  suggestion,
}: {
  suggestion: GrantReminderSuggestion;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [pending, startTransition] = useTransition();
  const anyRecurring = suggestion.reminders.some((r) => r.recurring);
  // A single reminder pre-fills its extracted date; with several, leave the
  // shared override blank so each keeps its own date unless the manager sets one.
  const [dueDate, setDueDate] = useState(
    suggestion.reminders.length === 1
      ? suggestion.reminders[0].dueDate ?? ""
      : ""
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestion.targetProjects.map((project) => project.id))
  );
  if (!visible) return null;

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const canApprove = selected.size > 0;

  const approve = () => {
    if (!canApprove) return;
    setVisible(false);
    startTransition(async () => {
      try {
        const result = await acceptGrantReminder(suggestion.notificationId, {
          dueDate: dueDate || undefined,
          projectIds: [...selected],
        });
        if (result.error) throw new Error(result.error);
        toast.success(
          anyRecurring
            ? "Added the grant obligation to the selected projects."
            : "Added the grant reminder to the selected projects."
        );
        router.refresh();
      } catch (error) {
        setVisible(true);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not add the grant reminder."
        );
      }
    });
  };

  const dismiss = () => {
    setVisible(false);
    startTransition(async () => {
      try {
        await dismissGrantReminder(suggestion.notificationId);
        router.refresh();
      } catch {
        setVisible(true);
        toast.error("Could not dismiss the suggestion.");
      }
    });
  };

  const dueId = `grant-reminder-due-${suggestion.notificationId}`;

  return (
    <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-3 sm:col-span-3">
      <div className="flex items-start gap-3 pr-8">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-medium">
            AI found a{" "}
            {anyRecurring ? "recurring grant obligation" : "grant reminder"} in
            this email
          </p>

          <ul className="space-y-1.5">
            {suggestion.reminders.map((reminder, index) => (
              <li key={index} className="text-xs text-muted-foreground">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-medium text-foreground">
                    {reminder.title}
                  </span>
                  <span>
                    ·{" "}
                    {reminder.recurring
                      ? `${CADENCE_LABEL[reminder.cadence]} report`
                      : reminder.dueDate
                        ? `due ${reminder.dueDate}`
                        : "one-off task"}
                  </span>
                </span>
                {reminder.detail ? (
                  <span className="mt-0.5 block line-clamp-2">
                    {reminder.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor={dueId} className="text-xs">
              {anyRecurring ? "First report due" : "Due date"}
            </Label>
            <Input
              id={dueId}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-8 w-auto"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-xs text-muted-foreground">
              Add to projects
            </legend>
            <div className="flex flex-col gap-1.5">
              {suggestion.targetProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={selected.has(project.id)}
                    onCheckedChange={(checked) =>
                      toggle(project.id, checked === true)
                    }
                  />
                  <span className="truncate">{project.title}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <Button
            type="button"
            size="sm"
            disabled={pending || !canApprove}
            onClick={approve}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Approve
          </Button>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss grant reminder suggestion"
        className="absolute right-2 top-2"
        disabled={pending}
        onClick={dismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Manage a thread's project links (many-to-many). Linked projects appear as
 * removable chips; the popover links an existing project or creates + links a
 * new one. All three mutations update the chip list optimistically.
 */
function ThreadProjectLinks({
  threadId,
  subject,
  threadProjects,
  projects,
}: {
  threadId: string;
  subject: string | null;
  threadProjects: ThreadProject[];
  projects: Option[];
}) {
  const router = useRouter();
  const [links, setLinks] = usePropState(threadProjects);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [kind, setKind] = useState<ProjectKind>("article");
  const [videoProductionMode, setVideoProductionMode] = useState<
    "original" | "translation"
  >("original");

  const linkedIds = new Set(links.map((link) => link.id));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const available = projects.filter(
    (project) =>
      !linkedIds.has(project.id) &&
      (!normalizedQuery ||
        project.label.toLocaleLowerCase().includes(normalizedQuery))
  );

  const addLink = (project: Option) => {
    setOpen(false);
    setQuery("");
    if (linkedIds.has(project.id)) return;
    const snapshot = links;
    setLinks((current) => [
      ...current,
      { id: project.id, slug: "", title: project.label, linkedManually: true },
    ]);
    start(async () => {
      try {
        await linkThreadProject(threadId, project.id);
        router.refresh();
      } catch {
        setLinks(snapshot);
        toast.error("Could not link the project.");
      }
    });
  };

  const removeLink = (project: ThreadProject) => {
    const snapshot = links;
    setLinks((current) => current.filter((link) => link.id !== project.id));
    start(async () => {
      try {
        await unlinkThreadProject(threadId, project.id);
        router.refresh();
      } catch {
        setLinks(snapshot);
        toast.error("Could not unlink the project.");
      }
    });
  };

  const openCreate = () => {
    setCreateTitle(query.trim() || titleFromSubject(subject));
    setCreateDescription("");
    setKind("article");
    setVideoProductionMode("original");
    setOpen(false);
    setCreateOpen(true);
  };

  const createAndLink = () => {
    const title = createTitle.trim();
    if (!title) return;
    setCreateOpen(false);
    setQuery("");
    const tempId = `new-project-${crypto.randomUUID()}`;
    const snapshot = links;
    setLinks((current) => [
      ...current,
      { id: tempId, slug: "", title, linkedManually: true },
    ]);
    start(async () => {
      const result = await createProjectFromThread({
        threadId,
        title,
        description: createDescription,
        kind,
        videoProductionMode:
          kind === "video_series" ? videoProductionMode : undefined,
      });
      if (result.error || !result.project) {
        setLinks(snapshot);
        setCreateOpen(true);
        toast.error(result.error ?? "Could not create and link the project.");
        return;
      }
      setLinks((current) =>
        current.map((link) =>
          link.id === tempId
            ? {
                id: result.project!.id,
                slug: result.project!.slug,
                title: result.project!.label,
                linkedManually: true,
              }
            : link
        )
      );
      setCreateTitle("");
      setCreateDescription("");
      toast.success(`Created and linked “${result.project.label}”.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {links.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            Not linked to a project yet.
          </span>
        ) : (
          links.map((project) => (
            <span
              key={project.id}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-1 text-sm"
            >
              <span className="max-w-[12rem] truncate">{project.title}</span>
              <button
                type="button"
                aria-label={`Unlink ${project.title}`}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                disabled={pending}
                onClick={() => removeLink(project)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 bg-transparent font-normal"
              disabled={pending}
              aria-label="Link a project"
            />
          }
        >
          <Plus className="size-4" />
          Link a project
          {pending ? (
            <Loader2 className="ml-0.5 size-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] gap-1 p-2"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="pl-8"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {available.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => addLink(project)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{project.label}</span>
              </button>
            ))}
            {available.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {normalizedQuery
                  ? `No projects match “${query.trim()}”.`
                  : "No more projects to link."}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start border-t"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            Create new project
          </Button>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              createAndLink();
            }}
          >
            <DialogHeader>
              <DialogTitle>Create and link a project</DialogTitle>
              <DialogDescription>
                The new project will be linked to this correspondence thread.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="correspondence-project-title">Project title</Label>
                <Input
                  id="correspondence-project-title"
                  autoFocus
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Project type</Label>
                <Select
                  value={kind}
                  onValueChange={(value) => setKind((value ?? "article") as ProjectKind)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="podcast">Podcast</SelectItem>
                    <SelectItem value="video_series">Video series</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {kind === "video_series" ? (
                <div className="space-y-1.5">
                  <Label>Video production mode</Label>
                  <Select
                    value={videoProductionMode}
                    onValueChange={(value) =>
                      setVideoProductionMode(
                        value === "translation" ? "translation" : "original"
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">Original</SelectItem>
                      <SelectItem value="translation">Translation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="correspondence-project-description">
                  Goal / description
                </Label>
                <Textarea
                  id="correspondence-project-description"
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  rows={4}
                  maxLength={2_000}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!createTitle.trim()}>
                Create and link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
