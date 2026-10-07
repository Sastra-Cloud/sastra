"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bug,
  Check,
  CircleAlert,
  FileText,
  Inbox,
  LifeBuoy,
  Lightbulb,
  Loader2,
  MessageSquare,
  Paperclip,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supportRouteSummary } from "@/lib/support/config";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

type Category = "support" | "bug" | "feature";
type Ticket = {
  id: string;
  requester_id?: string;
  subject: string;
  body: string;
  status: string;
  category: string;
  feature_status: string | null;
  email_muted: number;
};
type Thread = {
  ticket: Ticket;
  messages: {
    id: string;
    author: string;
    body: string;
    created_at: string;
    request_key?: string;
  }[];
  attachments: { id: string; name: string }[];
};
type ReplyDraft = { body: string; key: string; attemptedBody?: string };
const categories = [
  {
    value: "support" as const,
    title: "Contact support",
    description: "Get help using Sastra",
    icon: LifeBuoy,
    prompt: "What do you need help with?",
    placeholder: "Tell us what you're trying to do and where you need a hand.",
  },
  {
    value: "bug" as const,
    title: "Report a problem",
    description: "Something isn't working",
    icon: Bug,
    prompt: "What happened?",
    placeholder:
      "What did you expect? What happened instead? Include the steps we can use to reproduce it.",
  },
  {
    value: "feature" as const,
    title: "Request a feature",
    description: "Suggest an improvement",
    icon: Lightbulb,
    prompt: "What would make your work easier?",
    placeholder:
      "Describe the task or problem, your current workaround, and how an improvement would help.",
  },
];
const statusLabel = (value: string) =>
  ({
    open: "Open",
    waiting_customer: "Waiting for your reply",
    waiting_engineering: "With engineering",
    resolved: "Resolved",
    closed: "Closed",
    proposed: "Proposed",
    needs_clarification: "Needs clarification",
    approved: "Approved",
    building: "Building",
    shipped: "Shipped",
    declined: "Declined",
  })[value] ?? value.replaceAll("_", " ");
async function call<T>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/support", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error === "Invalid origin"
        ? "The support connection could not be verified. Please try again."
        : (result.error ?? "Support is unavailable. Please try again."),
    );
  return result as T;
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Check your connection and try again.";
}

export function SupportWorkspace({
  connected,
  version,
  userId,
}: {
  connected: boolean;
  version: { version: string; revision: string | null };
  userId: string;
}) {
  const params = useSearchParams();
  const categoryParam = params.get("category"),
    ticketParam = params.get("ticket");
  const [category, setCategory] = usePropState<Category>(
    categoryParam === "bug" || categoryParam === "feature"
      ? categoryParam
      : "support",
  );
  const [view, setView] = usePropState(
    params.get("view") === "requests" || ticketParam ? "requests" : "new",
  );
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [thread, setThread] = useState<Thread | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(ticketParam);
  const [subject, setSubject] = useState(""),
    [body, setBody] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [browser, setBrowser] = useState("");
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null),
    [submitting, setSubmitting] = useState<string | null>(null),
    [loading, setLoading] = useState(connected),
    [opening, setOpening] = useState(!!ticketParam),
    [replySending, setReplySending] = useState(false),
    [preferencePending, setPreferencePending] = useState(false),
    [downloadId, setDownloadId] = useState<string | null>(null);
  const [listError, setListError] = useState(""),
    [formError, setFormError] = useState(""),
    [threadError, setThreadError] = useState(""),
    [notice, setNotice] = useState(""),
    [reply, setReply] = useState(""),
    [copied, setCopied] = useState(false);
  const requestKey = useRef(""),
    submissionBusy = useRef(false),
    replyBusy = useRef(false),
    readSerial = useRef(0),
    listSerial = useRef(0),
    fileInput = useRef<HTMLInputElement>(null),
    replyDrafts = useRef(new Map<string, ReplyDraft>());
  const selectedRef = useRef<string | null>(ticketParam);
  const route = supportRouteSummary(params.get("from") ?? "/support");
  const diagnostics = JSON.stringify({ ...version, route, browser }, null, 2);
  const choice = categories.find((option) => option.value === category)!;

  useEffect(() => {
    queueMicrotask(() => setBrowser(navigator.userAgent.slice(0, 300)));
    requestKey.current = crypto.randomUUID();
  }, []);
  function draftFor(id: string) {
    if (!replyDrafts.current.has(id))
      replyDrafts.current.set(id, { body: "", key: crypto.randomUUID() });
    return replyDrafts.current.get(id)!;
  }
  async function loadRequests() {
    const serial = ++listSerial.current;
    setLoading(true);
    setListError("");
    try {
      const result = await call<{ tickets: Ticket[] }>({ op: "list" });
      if (serial === listSerial.current) setTickets(result.tickets);
    } catch (error) {
      if (serial === listSerial.current) setListError(message(error));
    } finally {
      if (serial === listSerial.current) setLoading(false);
    }
  }
  async function openRequest(id: string) {
    const serial = ++readSerial.current;
    selectedRef.current = id;
    setSelectedId(id);
    setThread(null);
    setOpening(true);
    setThreadError("");
    setReply(draftFor(id).body);
    try {
      const next = await call<Thread>({ op: "get", ticketId: id });
      if (serial === readSerial.current) setThread(next);
    } catch (error) {
      if (serial === readSerial.current) setThreadError(message(error));
    } finally {
      if (serial === readSerial.current) setOpening(false);
    }
  }
  useEffect(() => {
    if (!connected) return;
    let active = true;
    const serial = ++readSerial.current;
    const listRead = ++listSerial.current;
    call<{ tickets: Ticket[] }>({ op: "list" })
      .then((result) => {
        if (active && listRead === listSerial.current)
          setTickets(result.tickets);
      })
      .catch((error) => {
        if (active && listRead === listSerial.current)
          setListError(message(error));
      })
      .finally(() => {
        if (active && listRead === listSerial.current) setLoading(false);
      });
    if (ticketParam) {
      Promise.resolve()
        .then(() => {
          if (active) setOpening(true);
          return call<Thread>({ op: "get", ticketId: ticketParam });
        })
        .then((result) => {
          if (active && serial === readSerial.current) {
            selectedRef.current = ticketParam;
            setSelectedId(ticketParam);
            setThread(result);
            setReply(draftFor(ticketParam).body);
          }
        })
        .catch((error) => {
          if (active) setThreadError(message(error));
        })
        .finally(() => {
          if (active) setOpening(false);
        });
    }
    return () => {
      active = false;
    };
  }, [connected, ticketParam]);

  async function submitSupportRequest() {
    if (submissionBusy.current) return;
    submissionBusy.current = true;
    setSubmitting("Saving your request…");
    setFormError("");
    setNotice("");
    try {
      let saved = createdTicket;
      if (!saved) {
        saved = (
          await call<{ ticket: Ticket }>({
            op: "create",
            requestKey: requestKey.current,
            category,
            subject,
            body,
            diagnostics: { route, browser },
          })
        ).ticket;
        setCreatedTicket(saved);
        setTickets((current) => [
          saved!,
          ...current.filter((ticket) => ticket.id !== saved!.id),
        ]);
      }
      for (let index = 0; index < files.length; index++) {
        setSubmitting(`Uploading attachment ${index + 1} of ${files.length}…`);
        const file = files[index]!;
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]!);
          reader.onerror = () =>
            reject(
              new Error(
                "The attachment could not be read. Choose it again and retry.",
              ),
            );
          reader.readAsDataURL(file);
        });
        await call({ op: "upload", ticketId: saved.id, name: file.name, data });
      }
      setSubject("");
      setBody("");
      setFiles([]);
      setCreatedTicket(null);
      requestKey.current = crypto.randomUUID();
      if (fileInput.current) fileInput.current.value = "";
      setNotice("Request received. Follow the conversation in My requests.");
      setView("requests");
      await openRequest(saved.id);
      void loadRequests();
    } catch (error) {
      setFormError(message(error));
    } finally {
      submissionBusy.current = false;
      setSubmitting(null);
    }
  }
  async function sendSupportReply() {
    if (!thread || replyBusy.current || !reply.trim()) return;
    const id = thread.ticket.id,
      draft = draftFor(id),
      text = reply;
    replyBusy.current = true;
    draft.body = text;
    draft.attemptedBody ??= text;
    setReplySending(true);
    setThreadError("");
    setNotice("");
    try {
      const next = await call<Thread>({
        op: "reply",
        ticketId: id,
        requestKey: draft.key,
        body: text,
      });
      const saved = next.messages.find(
        (item) => item.request_key === draft.key,
      );
      const earlier = !!saved && saved.body !== text;
      draft.body = earlier ? text : "";
      draft.key = crypto.randomUUID();
      delete draft.attemptedBody;
      if (selectedRef.current === id) {
        setThread({ ...next, ticket: { ...next.ticket, status: "open" } });
        setReply(draft.body);
      }
      setNotice(
        earlier
          ? "Your earlier reply was already received. Your edited draft is kept."
          : "Reply received. It has been added to your conversation.",
      );
      void loadRequests();
    } catch (error) {
      setThreadError(
        `${message(error)} Your reply is kept. Retrying this reply will not create a duplicate.`,
      );
    } finally {
      replyBusy.current = false;
      setReplySending(false);
    }
  }
  async function updateSupportEmailPreference(muted: boolean) {
    if (!thread || preferencePending) return;
    const id = thread.ticket.id,
      previous = thread.ticket.email_muted;
    setPreferencePending(true);
    setThreadError("");
    setThread((current) =>
      current?.ticket.id === id
        ? {
            ...current,
            ticket: { ...current.ticket, email_muted: muted ? 1 : 0 },
          }
        : current,
    );
    try {
      await call({ op: "preferences", ticketId: id, emailMuted: muted });
    } catch (error) {
      setThread((current) =>
        current?.ticket.id === id
          ? { ...current, ticket: { ...current.ticket, email_muted: previous } }
          : current,
      );
      setThreadError(message(error));
    } finally {
      setPreferencePending(false);
    }
  }
  async function downloadSupportAttachment(id: string) {
    if (!thread || downloadId) return;
    setDownloadId(id);
    setThreadError("");
    try {
      const result = await call<{ data: string; type: string; name: string }>({
        op: "download",
        ticketId: thread.ticket.id,
        attachmentId: id,
      });
      const bytes = Uint8Array.from(atob(result.data), (character) =>
        character.charCodeAt(0),
      );
      const url = URL.createObjectURL(new Blob([bytes], { type: result.type })),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      setThreadError(message(error));
    } finally {
      setDownloadId(null);
    }
  }
  const diagnosticPanel = (
    <details className="rounded-lg border p-4">
      <summary className="min-h-11 cursor-pointer text-sm font-medium">
        Review diagnostic summary
      </summary>
      <pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs leading-relaxed">
        {diagnostics}
      </pre>
    </details>
  );

  if (!connected)
    return (
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-xl border bg-card p-6">
          <MessagesCommunity />
          <div className="mt-6 grid gap-3">
            <Button
              size="lg"
              className="justify-between"
              render={
                <a
                  href="https://github.com/Sastra-Cloud/sastra/discussions"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <MessageSquare aria-hidden="true" />
              Ask the community
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="justify-between"
              render={
                <a
                  href="https://github.com/Sastra-Cloud/sastra/issues/new/choose"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Bug aria-hidden="true" />
              Report a bug or suggest a feature
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </section>
        <aside className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Share useful context</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Copy this summary if you need it. Nothing is registered or uploaded
            to the private support service.
          </p>
          {diagnosticPanel}
          <Button
            size="lg"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(diagnostics).then(
                () => setCopied(true),
                () => setFormError("Select and copy the summary above."),
              )
            }
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <FileText aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy summary"}
          </Button>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </aside>
      </div>
    );

  return (
    <div className="space-y-5">
      {notice && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm"
        >
          <Check aria-hidden="true" className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <Tabs
        value={view}
        onValueChange={(value) => setView(String(value))}
        className="gap-6"
      >
        <TabsList variant="line" className="h-12 w-full justify-start border-b">
          <TabsTrigger value="new" className="min-h-11 flex-none gap-2 px-4">
            <LifeBuoy aria-hidden="true" />
            New request
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className="min-h-11 flex-none gap-2 px-4"
          >
            <Inbox aria-hidden="true" />
            My requests
            {tickets.length > 0 && (
              <Badge variant="secondary">{tickets.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="new" keepMounted>
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
            <form
              className="space-y-6 rounded-xl border bg-card p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void submitSupportRequest();
              }}
              aria-busy={!!submitting}
            >
              <fieldset
                disabled={!!createdTicket || !!submitting}
                className="space-y-3"
              >
                <legend className="mb-3 text-base font-semibold">
                  What do you need?
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {categories.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "relative flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-ring has-disabled:cursor-default",
                        category === option.value
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        name="support-category"
                        className="sr-only"
                        checked={category === option.value}
                        onChange={() => setCategory(option.value)}
                      />
                      <option.icon
                        aria-hidden="true"
                        className="mt-0.5 size-5 shrink-0 text-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {option.title}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                      {category === option.value && (
                        <Check
                          aria-hidden="true"
                          className="absolute right-2 top-2 size-3 text-primary"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="support-subject">Subject</Label>
                <Input
                  id="support-subject"
                  className="h-11"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={
                    category === "feature"
                      ? "A short title for your idea"
                      : "A short summary of what you need"
                  }
                  minLength={4}
                  maxLength={200}
                  required
                  readOnly={!!createdTicket || !!submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="support-body">{choice.prompt}</Label>
                <Textarea
                  id="support-body"
                  className="min-h-44 leading-relaxed"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder={choice.placeholder}
                  minLength={10}
                  maxLength={12000}
                  required
                  readOnly={!!createdTicket || !!submitting}
                />
              </div>
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Attachments{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </p>
                    <p
                      id="support-file-guidance"
                      className="text-sm text-muted-foreground"
                    >
                      PNG, JPG, WebP, or PDF · up to 10 files, 5 MB each
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={!!submitting}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip aria-hidden="true" />
                    Choose files
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  id="support-files"
                  aria-label="Choose support attachments"
                  aria-describedby="support-file-guidance"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="sr-only"
                  disabled={!!submitting}
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []);
                    if (
                      selected.length > 10 ||
                      selected.some((file) => file.size > 5 * 1024 * 1024)
                    ) {
                      setFormError(
                        "Select up to ten attachments, each no larger than 5 MB.",
                      );
                      event.target.value = "";
                    } else {
                      setFiles(selected);
                      setFormError("");
                    }
                  }}
                />
                {files.length > 0 && (
                  <ul className="space-y-1">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex min-h-11 items-center gap-2 text-sm"
                      >
                        <FileText
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 break-all">
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Remove ${file.name}`}
                          disabled={!!submitting}
                          onClick={() => {
                            setFiles((current) =>
                              current.filter(
                                (_, position) => position !== index,
                              ),
                            );
                            if (fileInput.current) fileInput.current.value = "";
                          }}
                        >
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-muted-foreground">
                  Only selected files are uploaded. Remove private or financial
                  details first.
                </p>
              </div>
              {createdTicket && !submitting && (
                <p role="status" className="text-sm">
                  Your request is saved. Retry to finish uploading its
                  attachments.
                </p>
              )}
              {formError && (
                <div
                  role="alert"
                  className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
                >
                  <p className="font-medium text-destructive">{formError}</p>
                  <p>
                    Your text and selected files are kept. You can retry safely.
                  </p>
                </div>
              )}
              <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {category === "feature"
                    ? "Ideas are reviewed; delivery dates aren't guaranteed."
                    : "Priority support, without a guaranteed response time."}
                </p>
                <Button
                  type="submit"
                  size="lg"
                  disabled={!!submitting}
                  className="sm:shrink-0"
                >
                  {submitting ? (
                    <Loader2
                      aria-hidden="true"
                      className="motion-safe:animate-spin"
                    />
                  ) : (
                    <ArrowRight aria-hidden="true" />
                  )}
                  {submitting
                    ? "Submitting…"
                    : createdTicket
                      ? "Retry attachments"
                      : category === "feature"
                        ? "Submit feature request"
                        : "Submit request"}
                </Button>
              </div>
              {submitting && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  {submitting}
                </p>
              )}
            </form>
            <aside className="space-y-5 rounded-xl border bg-card p-5">
              <div className="space-y-2">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-5 text-primary"
                />
                <h2 className="font-semibold">
                  A private support conversation
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your request is visible to you, workspace admins, the cloud
                  account owner, and support operators.
                </p>
              </div>
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-semibold">
                  Useful context, with your control
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  We include the app version, browser, and a route without
                  record identifiers. Documents and browsing history aren't
                  captured.
                </p>
                {diagnosticPanel}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                AI may help classify requests and draft answers using required,
                redacted text. A person reviews replies and engineering work.
              </p>
              <Link
                href="/help/support"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                How support works
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="requests" keepMounted>
          <div className="grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
            <section
              className="min-w-0 rounded-xl border bg-card"
              aria-label="Your requests"
            >
              <div className="flex items-center justify-between gap-3 border-b p-4">
                <h2 className="font-semibold">My requests</h2>
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  aria-label="Refresh requests"
                  disabled={loading}
                  onClick={() => void loadRequests()}
                >
                  {loading ? (
                    <Loader2
                      aria-hidden="true"
                      className="motion-safe:animate-spin"
                    />
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </div>
              {listError && (
                <div role="alert" className="space-y-2 p-4 text-sm">
                  <p className="text-destructive">{listError}</p>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => void loadRequests()}
                  >
                    Retry loading requests
                  </Button>
                </div>
              )}
              {loading && !tickets.length ? (
                <div className="space-y-3 p-4" aria-label="Loading requests">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : tickets.length > 0 ? (
                <ul className="divide-y">
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        aria-current={
                          selectedId === ticket.id ? "true" : undefined
                        }
                        className={cn(
                          "flex min-h-20 w-full flex-col items-start gap-2 px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          selectedId === ticket.id
                            ? "bg-primary/5"
                            : "hover:bg-muted/40",
                        )}
                        onClick={() => void openRequest(ticket.id)}
                      >
                        <span className="break-words text-sm font-semibold">
                          {ticket.subject}
                        </span>
                        <span className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span>{statusLabel(ticket.status)}</span>
                          {ticket.feature_status && (
                            <span>· {statusLabel(ticket.feature_status)}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                !listError && (
                  <div className="space-y-3 p-5">
                    <Inbox
                      aria-hidden="true"
                      className="size-6 text-muted-foreground"
                    />
                    <p className="text-sm font-medium">No requests yet</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Your questions, problems, and ideas will appear here.
                    </p>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setView("new")}
                    >
                      Start a request
                    </Button>
                  </div>
                )
              )}
            </section>
            <section
              className="min-w-0 rounded-xl border bg-card p-5 sm:p-6"
              aria-label="Request conversation"
              aria-busy={opening || replySending}
            >
              {opening ? (
                <div className="space-y-4" role="status">
                  <p className="text-sm">Opening conversation…</p>
                  <Skeleton className="h-8 w-2/3" />
                  <Skeleton className="h-28" />
                </div>
              ) : thread ? (
                <>
                  <div className="mb-6 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {statusLabel(thread.ticket.status)}
                      </Badge>
                      {thread.ticket.feature_status && (
                        <Badge variant="outline">
                          {statusLabel(thread.ticket.feature_status)}
                        </Badge>
                      )}
                    </div>
                    <h2 className="break-words font-heading text-xl font-semibold">
                      {thread.ticket.subject}
                    </h2>
                    <p className="max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {thread.ticket.body}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "space-y-5",
                      thread.messages.length > 0 && "border-t pt-5",
                    )}
                  >
                    {thread.messages.map((item) => (
                      <section
                        key={item.id}
                        className={cn(
                          "rounded-lg p-4",
                          item.author === "operator" ? "bg-muted/50" : "border",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-semibold">
                            {item.author === "operator"
                              ? "Sastra support"
                              : "Customer reply"}
                          </span>
                          <time
                            dateTime={item.created_at}
                            className="text-muted-foreground"
                          >
                            {new Date(item.created_at).toLocaleString()}
                          </time>
                        </div>
                        <p className="mt-2 max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {item.body}
                        </p>
                      </section>
                    ))}
                  </div>
                  {thread.attachments.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {thread.attachments.map((file) => (
                        <Button
                          key={file.id}
                          variant="outline"
                          size="lg"
                          disabled={!!downloadId}
                          onClick={() =>
                            void downloadSupportAttachment(file.id)
                          }
                        >
                          {downloadId === file.id ? (
                            <Loader2
                              aria-hidden="true"
                              className="motion-safe:animate-spin"
                            />
                          ) : (
                            <Paperclip aria-hidden="true" />
                          )}
                          <span className="max-w-52 truncate">{file.name}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                  <form
                    className="mt-6 space-y-3 border-t pt-5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendSupportReply();
                    }}
                  >
                    <Label htmlFor="support-reply">
                      Add to the conversation
                    </Label>
                    <Textarea
                      id="support-reply"
                      className="min-h-28"
                      required
                      maxLength={12000}
                      value={reply}
                      readOnly={replySending}
                      onChange={(event) => {
                        setReply(event.target.value);
                        draftFor(thread.ticket.id).body = event.target.value;
                      }}
                      placeholder="Add details or reply to support…"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        {replySending
                          ? "Saving your reply…"
                          : "Your reply stays in this private conversation."}
                      </p>
                      <Button
                        type="submit"
                        size="lg"
                        disabled={replySending || !reply.trim()}
                      >
                        {replySending && (
                          <Loader2
                            aria-hidden="true"
                            className="motion-safe:animate-spin"
                          />
                        )}
                        {replySending ? "Sending…" : "Send reply"}
                      </Button>
                    </div>
                  </form>
                  {thread.ticket.requester_id === userId && (
                    <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={!!thread.ticket.email_muted}
                        disabled={preferencePending}
                        onChange={(event) =>
                          void updateSupportEmailPreference(
                            event.target.checked,
                          )
                        }
                      />
                      Mute email replies
                      <span className="text-muted-foreground">
                        {preferencePending
                          ? "Saving…"
                          : "You can keep replying here."}
                      </span>
                    </label>
                  )}
                </>
              ) : (
                !threadError && (
                  <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                    <MessageSquare
                      aria-hidden="true"
                      className="size-8 text-muted-foreground"
                    />
                    <h2 className="font-heading text-xl font-semibold">
                      Your conversations, in one place
                    </h2>
                    <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Select a request to read updates, add details, and reply
                      to support.
                    </p>
                  </div>
                )
              )}
              {threadError && (
                <div
                  role="alert"
                  className="mt-4 space-y-3 rounded-lg border border-destructive/30 p-4 text-sm"
                >
                  <p className="flex items-start gap-2 text-destructive">
                    <CircleAlert
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    {threadError}
                  </p>
                  {!thread && selectedId && (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => void openRequest(selectedId)}
                    >
                      Retry opening request
                    </Button>
                  )}
                </div>
              )}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
function MessagesCommunity() {
  return (
    <div className="space-y-3">
      <MessageSquare aria-hidden="true" className="size-6 text-primary" />
      <h2 className="font-heading text-xl font-semibold">Community help</h2>
      <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
        For self-hosted Sastra, ask a question in Discussions or report a bug or
        feature idea on GitHub. Check the help guides first for step-by-step
        answers.
      </p>
    </div>
  );
}
