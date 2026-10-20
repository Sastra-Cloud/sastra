"use client";

import { confirmDialog } from "@/lib/dialog-requests";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Mic,
  Pencil,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";

import {
  approveAllAssistantActions,
  approveAssistantAction,
  clearAssistantThread,
  declineAssistantAction,
  rateAssistantMessage,
  sendAssistantMessage,
  updateAssistantAction,
} from "@/lib/assistant/actions";
import type {
  AssistantThreadMessage,
  PendingActionView,
} from "@/lib/assistant/queries";
import type { BudgetStatus } from "@/lib/assistant/budget-math";
import type { MemoryFact } from "@/lib/assistant/memory";
import { MemoryManager } from "@/components/assistant/memory-manager";
import { AssistantMessageContent } from "@/components/assistant/assistant-message-content";
import { offerToLearnTerms } from "@/components/tasks/learn-terms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { ConversationJump } from "@/components/chat/conversation-jump";
import { useConversationViewport } from "@/hooks/use-conversation-viewport";
import { useConversationScroll } from "@/hooks/use-conversation-scroll";
import { sendOnConversationKey } from "@/lib/chat/composer-key";
import { usePropState } from "@/hooks/use-prop-state";

// Generic prompts work for every organization.
const EXAMPLES = [
  "What can you help me with?",
  "What are my open tasks?",
  "Help me create a task for my project.",
  "Show me everything blocked in my projects.",
];

export function AssistantWorkspace({
  userName,
  messages,
  pending,
  budget,
  memory,
  variant = "page",
  projectSlug = null,
  projectTitle,
  runScope = null,
  initialComposerText,
  composerSeed,
  onAfterAction,
  onClose,
}: {
  userName: string;
  messages: AssistantThreadMessage[];
  pending: PendingActionView[];
  budget: BudgetStatus;
  memory?: { enabled: boolean; facts: MemoryFact[] };
  /** "page" fills the route view; "embedded" fills its container (floating panel). */
  variant?: "page" | "embedded";
  /** Current project slug, forwarded so the assistant knows "this project". */
  projectSlug?: string | null;
  /** Server-resolved current project title, shown so the target is explicit. */
  projectTitle?: string | null;
  /** Current `?run=` board scope, so new tasks match the view the user is on. */
  runScope?: string | null;
  /** Prompt to drop into the composer (e.g. from "Walk me through this"). */
  initialComposerText?: string;
  /** Changes when a new prompt is seeded, so identical text re-prefills. */
  composerSeed?: number;
  /** Called after a send/approve to refresh state (defaults to router.refresh). */
  onAfterAction?: () => void | Promise<void>;
  /** Closes the floating mobile/desktop panel; omitted on the dedicated page. */
  onClose?: () => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initialComposerText ?? "");
  const [busy, startBusy] = useTransition();
  const [visibleMessages, setVisibleMessages] = usePropState(messages);
  const [visiblePending, setVisiblePending] = usePropState(pending);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [executingActionId, setExecutingActionId] = useState<string | null>(
    null
  );
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackComment, setFeedbackComment] = useState("");
  const viewportRef = useConversationViewport<HTMLDivElement>(variant === "page");
  const { scrollRef, onScroll, canJump, scrollToLatest } = useConversationScroll(`${visibleMessages.length}:${visiblePending.length}:${busy}`);

  const actionOpts =
    projectSlug || runScope
      ? { projectSlug: projectSlug ?? undefined, runScope }
      : undefined;
  const afterAction = onAfterAction ?? (() => router.refresh());

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  // Prefill the composer when a page seeds a prompt ("Walk me through this").
  // Adjusting state during render (keyed on the seed) is React's recommended
  // pattern for "react to a prop change" and refills even when the same text is
  // sent twice. We never auto-send — the user reviews, edits, or speaks first.
  const [lastComposerSeed, setLastComposerSeed] = useState(composerSeed);
  if (composerSeed !== undefined && composerSeed !== lastComposerSeed) {
    setLastComposerSeed(composerSeed);
    if (initialComposerText) setInput(initialComposerText);
  }
  // Mirror the input so the recorder's onstop closure can read the latest value.
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  // Mirror the current project so a send (esp. voice, whose onstop closure is
  // created when recording starts) always targets the page you're on NOW.
  const projectSlugRef = useRef(projectSlug);
  const runScopeRef = useRef(runScope);
  useEffect(() => {
    projectSlugRef.current = projectSlug;
    runScopeRef.current = runScope;
  }, [projectSlug, runScope]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMicSupported(
        !!navigator.mediaDevices?.getUserMedia &&
          typeof window.MediaRecorder !== "undefined"
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size === 0) {
          recordingStartedAtRef.current = null;
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "recording.webm");
          const startedAt = recordingStartedAtRef.current;
          if (startedAt) {
            fd.append("durationMs", String(Math.max(0, Date.now() - startedAt)));
          }
          const res = await fetch("/api/assistant/transcribe", {
            method: "POST",
            body: fd,
          });
          if (!res.ok) throw new Error("transcribe failed");
          const data = (await res.json()) as { text?: string };
          const text = (data.text ?? "").trim();
          if (text) {
            // Keep the transcript in the composer so it can be reviewed first.
            const typed = inputRef.current.trim();
            setInput(typed ? `${typed} ${text}` : text);
          } else {
            toast.error("Didn't catch that — try again.");
          }
        } catch {
          toast.error("Couldn't transcribe the audio.");
        } finally {
          recordingStartedAtRef.current = null;
          setTranscribing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone access was blocked.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function toggleMic() {
    if (recording) stopRecording();
    else void startRecording();
  }

  const spentPct =
    budget.budgetUsd > 0
      ? Math.min(100, Math.round((budget.spentUsd / budget.budgetUsd) * 100))
      : 0;
  const blocked = budget.blocked;
  const bulkMessageId =
    visiblePending.length > 1 &&
    visiblePending.every(
      (action) =>
        action.messageId === visiblePending[0]?.messageId && action.riskLevel !== "high"
    )
      ? visiblePending[0]?.messageId
      : null;

  function sendText(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    scrollToLatest();
    setInput("");
    // Read project + scope from refs so a voice send uses the current page/view.
    const opts =
      projectSlugRef.current || runScopeRef.current
        ? {
            projectSlug: projectSlugRef.current ?? undefined,
            runScope: runScopeRef.current,
          }
        : undefined;
    const optimisticId = `optimistic-user-${crypto.randomUUID()}`;
    setVisibleMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        feedback: null,
      },
    ]);
    startBusy(async () => {
      try {
        await sendAssistantMessage(text, opts);
        await afterAction();
      } catch {
        setVisibleMessages((current) =>
          current.filter((message) => message.id !== optimisticId)
        );
        setInput(text);
        toast.error("The assistant couldn't respond. Please try again.");
      }
    });
  }

  function send() {
    sendText(input);
  }

  function resolve(fn: () => Promise<void>, failMsg: string) {
    startBusy(async () => {
      try {
        await fn();
        await afterAction();
      } catch {
        toast.error(failMsg);
      }
    });
  }

  function approveAction(action: PendingActionView) {
    setExecutingActionId(action.id);
    startBusy(async () => {
      try {
        const result = await approveAssistantAction(action.id, actionOpts);
        await afterAction();
        if (result.status === "failed") {
          toast.error(result.result || "The action could not be completed.");
          return;
        }
        if (action.toolName === "draft_email") {
          toast.success("Email sent");
        }
      } catch {
        toast.error(
          action.toolName === "draft_email"
            ? "The email could not be sent."
            : "Couldn't run the action"
        );
      } finally {
        setExecutingActionId(null);
      }
    });
  }

  function startEdit(p: PendingActionView) {
    setEditingId(p.id);
    setEditValues(p.values);
  }

  function saveEdit(id: string) {
    const action = visiblePending.find((p) => p.id === id);
    const previousTitle = action?.values.title ?? "";
    const nextTitle = editValues.title ?? "";
    startBusy(async () => {
      try {
        await updateAssistantAction(id, editValues, actionOpts);
        setEditingId(null);
        await afterAction();
        // Fixing a task's title here often means correcting a name voice
        // misheard. Offer to teach the voice dictionary the new spelling —
        // the same prompt the task board and detail dialog show on a title edit.
        if (action?.toolName === "create_task" && nextTitle !== previousTitle) {
          offerToLearnTerms(previousTitle, nextTitle);
        }
      } catch {
        toast.error("Couldn't update the action");
      }
    });
  }

  function saveFeedback(messageId: string, rating: 1 | -1, comment?: string) {
    const previous = visibleMessages;
    setVisibleMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, feedback: { rating, comment: comment || null } }
          : message
      )
    );
    startBusy(async () => {
      try {
        await rateAssistantMessage(messageId, rating, comment || null);
        setFeedbackId(null);
        setFeedbackComment("");
        await afterAction();
      } catch {
        setVisibleMessages(previous);
        toast.error("Couldn't save that feedback");
      }
    });
  }

  const page = variant !== "embedded";
  const wideHeader = page ? "@[72rem]/assistant:col-start-1 @[72rem]/assistant:row-start-1" : "";
  const wideMeter = page ? "@[72rem]/assistant:col-start-2 @[72rem]/assistant:row-start-1 @[72rem]/assistant:self-start" : "";
  const wideTranscript = page ? "@[72rem]/assistant:col-start-1 @[72rem]/assistant:row-start-2 @[72rem]/assistant:mx-auto @[72rem]/assistant:w-full @[72rem]/assistant:max-w-4xl" : "";
  const wideComposer = page ? "@[72rem]/assistant:col-start-1 @[72rem]/assistant:row-start-3 @[72rem]/assistant:mx-auto @[72rem]/assistant:w-full @[72rem]/assistant:max-w-4xl" : "";
  const headerActions = (
        <div className="flex shrink-0 items-center gap-1">
          {memory ? <MemoryManager state={memory} /> : null}
          {visibleMessages.length > 0 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear chat"
              title="Clear chat"
              disabled={busy}
              onClick={async () => {
                if (!(await confirmDialog("Clear this conversation? This cannot be undone."))) return;
                const previous = visibleMessages;
                setVisibleMessages([]);
                startBusy(async () => {
                  try {
                    await clearAssistantThread();
                    await afterAction();
                  } catch {
                    setVisibleMessages(previous);
                    toast.error("Couldn't clear the conversation");
                  }
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
  );
  const usagePanel = (
      <div className="rounded-lg border bg-card px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Monthly AI usage</span>
          <span className="tabular-nums font-medium">{spentPct}% used</span>
        </div>
        <AnimatedBar
          value={spentPct}
          className={cn(spentPct >= 100 ? "bg-destructive" : "bg-primary")}
          trackClassName="mt-1.5 h-1.5"
        />
      </div>
  );

  const content = (
    <div ref={viewportRef} data-mobile-conversation={variant === "page" ? "" : undefined}
      className={cn(
        "flex min-h-0 w-full flex-col lg:gap-3",
        variant === "embedded"
          ? "h-full"
          : "conversation-route h-[var(--conversation-height,calc(100dvh-7.5rem))] @[72rem]/assistant:grid @[72rem]/assistant:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] @[72rem]/assistant:grid-rows-[auto_minmax(0,1fr)_auto] @[72rem]/assistant:gap-x-8"
      )}
    >
      <div className={wideHeader}><ConversationHeader title="Assistant" subtitle="Private to you · Review changes before saving" backHref="/dashboard" onClose={onClose} actions={headerActions}>
        {usagePanel}
      </ConversationHeader></div>
      <div className={cn("hidden shrink-0 lg:block", wideMeter)}>{usagePanel}</div>

      {/* Transcript */}
      <div className={cn("relative flex min-h-0 flex-1 flex-col", wideTranscript)}>
      <div ref={scrollRef} onScroll={onScroll} data-conversation-scroll role="region" aria-label="Messages" tabIndex={0} className="conversation-transcript min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 lg:rounded-xl lg:border lg:p-4">
      <div className="flex min-h-full flex-col justify-end gap-3">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="font-heading text-base font-semibold">
                Hi {userName.split(" ")[0]} — how can I help?
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask me to find things or make changes. I&apos;ll show a preview
                before anything is saved.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy || blocked}
                  onClick={() => setInput(ex)}
                  className="min-h-11 rounded-full border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          visibleMessages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 max-w-[92%] flex-col gap-1 lg:max-w-[85%]",
                  m.role === "user" ? "items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[65ch] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-[15px] leading-relaxed lg:text-sm",
                    m.role === "user"
                      ? "rounded-br-sm conversation-own-bubble bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground"
                  )}
                >
                  {m.role === "assistant" ? (
                    <AssistantMessageContent content={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
                {m.role === "assistant" ? (
                  <div className="w-full space-y-1">
                    <div className="flex items-center gap-0.5 px-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Helpful response"
                        className={cn(m.feedback?.rating === 1 && "text-primary")}
                        disabled={busy}
                        onClick={() => saveFeedback(m.id, 1)}
                      >
                        <ThumbsUp className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Response needs improvement"
                        className={cn(m.feedback?.rating === -1 && "text-destructive")}
                        disabled={busy}
                        onClick={() => {
                          setFeedbackId(feedbackId === m.id ? null : m.id);
                          setFeedbackComment(m.feedback?.comment ?? "");
                        }}
                      >
                        <ThumbsDown className="size-3.5" />
                      </Button>
                    </div>
                    {feedbackId === m.id ? (
                      <div className="space-y-1.5 rounded-lg border bg-card p-2">
                        <Textarea
                          value={feedbackComment}
                          onChange={(event) => setFeedbackComment(event.target.value)}
                          rows={2}
                          maxLength={1000}
                          placeholder="What should it have done differently?"
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setFeedbackId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="xs"
                            disabled={busy}
                            onClick={() => saveFeedback(m.id, -1, feedbackComment)}
                          >
                            Send feedback
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}

        {busy ? (
          <div role="status" aria-live="polite" className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Assistant is working…
          </div>
        ) : null}
      </div>

      {/* Pending approvals */}
      {visiblePending.length > 0 ? (
        <Reveal className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {visiblePending.length === 1
                ? "Approve this action?"
                : `Approve ${visiblePending.length} actions?`}
            </p>
            {bulkMessageId ? (
              <Button
                size="xs"
                disabled={busy}
                onClick={() =>
                  resolve(
                    () => approveAllAssistantActions(bulkMessageId, actionOpts),
                    "Couldn't approve the actions"
                  )
                }
              >
                <Check className="size-3.5" />
                Approve all
              </Button>
            ) : null}
          </div>
          <ul className="space-y-2">
            {visiblePending.map((p) => (
              <li key={p.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
                {editingId === p.id ? (
                  <div className="space-y-2">
                    {p.editableFields.map((f) => (
                      <div key={f.name} className="space-y-1">
                        <label className="text-xs text-muted-foreground">
                          {f.label}
                        </label>
                        {f.multiline ? (
                          <Textarea
                            rows={f.name === "body" ? 10 : 3}
                            value={editValues[f.name] ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                [f.name]: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Input
                            value={editValues[f.name] ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                [f.name]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button size="xs" disabled={busy} onClick={() => saveEdit(p.id)}>
                        <Check className="size-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {p.riskLevel === "high" ? (
                      <span className="w-fit rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-text">
                        Individual approval required
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 whitespace-pre-wrap text-pretty">
                      {p.preview}
                    </span>
                    <div className="flex shrink-0 items-center justify-end gap-1.5">
                      {p.editableFields.length > 0 ? (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={busy}
                          aria-label="Edit action"
                          title="Edit"
                          onClick={() => startEdit(p)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        size="xs"
                        disabled={busy}
                        onClick={() => approveAction(p)}
                      >
                        {executingActionId === p.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                        {executingActionId === p.id
                          ? p.toolName === "draft_email"
                            ? "Sending…"
                            : "Working…"
                          : p.toolName === "draft_email"
                            ? "Send email"
                            : "Approve"}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          const previous = visiblePending;
                          setVisiblePending((current) =>
                            current.filter((action) => action.id !== p.id)
                          );
                          startBusy(async () => {
                            try {
                              await declineAssistantAction(p.id);
                              await afterAction();
                            } catch {
                              setVisiblePending(previous);
                              toast.error("Couldn't decline the action");
                            }
                          });
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Reveal>
      ) : null}

      </div>
      <ConversationJump visible={canJump} onClick={scrollToLatest} />
      </div>

      {/* Composer */}
      {blocked ? (
        <p className={cn("rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-text", wideComposer)}>
          {budget.enabled
            ? "You've reached your monthly AI limit. Ask an admin to raise it."
            : "Your AI assistant is disabled. Ask an admin to enable it."}
        </p>
      ) : (
        <div className={cn("conversation-composer space-y-2 border-t bg-background px-2 pt-2 lg:border-0", wideComposer)}>
          <div className="flex min-w-0 items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                projectSlug ? "bg-primary" : "bg-muted-foreground/50"
              )}
            />
            <span className="min-w-0 truncate" title={projectSlug ? `Acting on ${projectTitle ?? projectSlug}` : "General — tasks won’t be tied to a project"}>
              {projectSlug ? `Acting on ${projectTitle ?? projectSlug}` : "General — tasks won’t be tied to a project"}
            </span>
          </div>
          {recording || transcribing ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                recording
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-muted text-muted-foreground"
              )}
            >
              {recording ? (
                <>
                  <span className="relative flex size-2.5 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-destructive/70" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-destructive" />
                  </span>
                  <span className="font-medium">Recording…</span>
                  <span className="text-destructive/80">
                    tap the mic to stop and review
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  <span>Transcribing…</span>
                </>
              )}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
          <Textarea
            value={input}
            disabled={busy || recording}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              sendOnConversationKey(e, send);
            }}
            placeholder="Ask your assistant to find or do something…"
            className="min-h-11 max-h-32 flex-1 resize-none rounded-xl"
            rows={1}
          />
          {micSupported ? (
            <Button
              size="icon"
              type="button"
              variant={recording ? "destructive" : "outline"}
              aria-label={recording ? "Stop recording" : "Record voice"}
              title={recording ? "Stop recording" : "Record voice"}
              disabled={busy || transcribing}
              onClick={toggleMic}
              className={cn("size-11 shrink-0", recording && "animate-pulse")}
            >
              {transcribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          ) : null}
          <Button
            size="icon"
            aria-label="Send"
            className="conversation-send size-11 shrink-0"
            disabled={busy || recording || transcribing || !input.trim()}
            onClick={send}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
          </div>
        </div>
      )}
    </div>
  );
  return page ? <div className="@container/assistant min-w-0">{content}</div> : content;
}
