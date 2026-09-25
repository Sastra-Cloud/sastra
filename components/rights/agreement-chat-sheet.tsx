"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  BookOpenText,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  clearAgreementChat,
  getAgreementChatSnapshot,
  retryAgreementIndex,
  sendAgreementQuestion,
  type AgreementChatCitation,
  type AgreementChatMessage,
  type AgreementChatSnapshot,
} from "@/lib/agreement-chat/actions";
import { friendlyAgreementIndexError } from "@/lib/agreement-chat/index-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePropState } from "@/hooks/use-prop-state";

const STARTERS = [
  "What formats and territories are permitted?",
  "What are our payment and reporting obligations?",
  "When can this agreement end?",
  "Compare the MoU and License.",
];

function sourceLabel(label: "mou" | "license") {
  return label === "mou" ? "MoU" : "License";
}

function pageLabel(citation: AgreementChatCitation) {
  if (!citation.pageStart) return null;
  return citation.pageEnd && citation.pageEnd !== citation.pageStart
    ? `pages ${citation.pageStart}–${citation.pageEnd}`
    : `page ${citation.pageStart}`;
}

function Citation({
  citation,
  number,
}: {
  citation: AgreementChatCitation;
  number: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const location = [citation.section, pageLabel(citation)].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="max-w-full rounded-full px-2.5"
        aria-expanded={expanded}
        disabled={!citation.sourceAvailable}
        title={citation.sourceAvailable ? "Show cited clause" : "Source removed"}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="tabular-nums">{number}</span>
        <span className="truncate">{citation.documentName}</span>
        <ChevronDown
          className={cn(
            "size-3 transition-transform motion-reduce:transition-none",
            expanded && "rotate-180"
          )}
        />
      </Button>
      {expanded && citation.passage ? (
        <div className="mt-2 space-y-2 rounded-lg bg-muted p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{citation.documentName}</p>
              <p className="text-xs text-muted-foreground">
                {sourceLabel(citation.label)}
                {location ? ` · ${location}` : ""}
              </p>
            </div>
            <Button
              nativeButton={false}
              render={<a href={`/api/files/${citation.fileId}/download?inline=1`} target="_blank" rel="noreferrer" />}
              size="xs"
              variant="outline"
            >
              Open source
              <ExternalLink className="size-3" />
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-pretty leading-relaxed">
            {citation.passage}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Message({
  message,
  snapshot,
}: {
  message: AgreementChatMessage;
  snapshot: AgreementChatSnapshot;
}) {
  const names = message.selectedDocumentIds.map((id) => {
    const document = snapshot.documents.find((source) => source.id === id);
    return document ? sourceLabel(document.label) : "Unavailable source";
  });
  return (
    <div className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
      <div className={cn("min-w-0 space-y-2", message.role === "user" ? "max-w-[88%]" : "w-full")}>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-relaxed text-pretty",
            message.role === "user"
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted text-foreground"
          )}
        >
          {message.content}
        </div>
        {message.role === "user" ? (
          <p className="px-1 text-right text-[11px] text-muted-foreground">
            {names.join(" + ")}
          </p>
        ) : (
          <div className="space-y-2 px-1">
            {message.stale ? (
              <p className="flex items-center gap-1.5 text-xs text-warning-foreground">
                <AlertTriangle className="size-3.5" />
                A cited source was removed. This answer is historical and its citation can no longer be opened.
              </p>
            ) : null}
            {message.answerStatus === "not_stated" ? (
              <p className="text-xs font-medium text-muted-foreground">Not stated in the selected sources</p>
            ) : message.answerStatus === "ambiguous" ? (
              <p className="text-xs font-medium text-warning-foreground">The selected sources are ambiguous or conflicting</p>
            ) : null}
            {message.citations.length > 0 ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Answer citations">
                {message.citations.map((citation, index) => (
                  <Citation
                    key={`${citation.chunkId}-${index}`}
                    citation={citation}
                    number={index + 1}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function AgreementChatSheet({
  initialSnapshot,
  canManage,
}: {
  initialSnapshot: AgreementChatSnapshot;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = usePropState(initialSnapshot);
  const readyIds = useMemo(
    () =>
      snapshot.documents.flatMap((document) =>
        document.status === "ready" && document.id ? [document.id] : []
      ),
    [snapshot.documents]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(readyIds);
  const [input, setInput] = useState("");
  const [busy, startTransition] = useTransition();
  const [progress, setProgress] = useState("Searching agreements…");
  const scrollRef = useRef<HTMLDivElement>(null);
  const knownReadyIdsRef = useRef(new Set(readyIds));
  const indexingCount = snapshot.documents.filter(
    (document) => document.status === "pending" || document.status === "processing"
  ).length;
  const failedDocuments = snapshot.documents.filter(
    (document) => document.status === "failed"
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [snapshot.messages.length, busy]);

  useEffect(() => {
    const previous = knownReadyIdsRef.current;
    const newlyReady = readyIds.filter((id) => !previous.has(id));
    setSelectedIds((current) => [
      ...new Set([
        ...current.filter((id) => readyIds.includes(id)),
        ...newlyReady,
      ]),
    ]);
    knownReadyIdsRef.current = new Set(readyIds);
  }, [readyIds]);

  useEffect(() => {
    if (!open || indexingCount === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const next = await getAgreementChatSnapshot(snapshot.projectId);
        if (!cancelled) setSnapshot(next);
      } catch {
        // Keep the current state visible and try again; this is background refresh.
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 8_000);
      }
    }

    timer = setTimeout(refresh, 4_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [indexingCount, open, setSnapshot, snapshot.projectId]);

  function toggleSource(documentId: string) {
    setSelectedIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  }

  function send(raw = input) {
    const text = raw.trim();
    if (!text || busy || selectedIds.length === 0) return;
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const previous = snapshot;
    setInput("");
    setProgress("Searching agreements…");
    setSnapshot({
      ...snapshot,
      messages: [
        ...snapshot.messages,
        {
          id: optimisticId,
          role: "user",
          content: text,
          selectedDocumentIds: [...selectedIds],
          answerStatus: null,
          citations: [],
          retrievalMode: null,
          stale: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    startTransition(async () => {
      const progressTimer = window.setTimeout(
        () => setProgress("Reading the cited clauses…"),
        900
      );
      try {
        const next = await sendAgreementQuestion(
          snapshot.projectId,
          text,
          selectedIds
        );
        setSnapshot(next);
      } catch (error) {
        setSnapshot(previous);
        setInput(text);
        toast.error(
          error instanceof Error
            ? error.message
            : "The agreement question could not be answered."
        );
      } finally {
        window.clearTimeout(progressTimer);
      }
    });
  }

  async function clearConversation() {
    if (!(await confirmDialog("Clear your private agreement conversation for this project?"))) {
      return;
    }
    const previous = snapshot;
    setSnapshot({ ...snapshot, messages: [] });
    startTransition(async () => {
      try {
        await clearAgreementChat(snapshot.projectId);
      } catch {
        setSnapshot(previous);
        toast.error("Could not clear the conversation.");
      }
    });
  }

  function retry(documentId: string) {
    startTransition(async () => {
      try {
        setSnapshot(await retryAgreementIndex(documentId));
        toast.success("Agreement indexing restarted.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not retry indexing.");
      }
    });
  }

  const hasAttachments = snapshot.documents.length > 0;
  const hasReady = readyIds.length > 0;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full sm:ml-auto sm:w-auto"
          />
        }
      >
        <MessageCircleQuestion className="size-4" />
        Ask about agreements
      </SheetTrigger>
      <SheetContent
        side="right"
        className="h-[100dvh] gap-0 p-0 motion-reduce:transition-none data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:border-l-0 sm:data-[side=right]:w-[48rem] sm:data-[side=right]:max-w-[calc(100vw-2rem)] sm:data-[side=right]:border-l"
      >
        <SheetHeader className="shrink-0 gap-3 border-b px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 pr-12 sm:px-5 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">Ask about agreements</SheetTitle>
              <SheetDescription className="truncate">{snapshot.projectName}</SheetDescription>
            </div>
            {snapshot.messages.length > 0 ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="shrink-0 text-muted-foreground"
                aria-label="Clear conversation"
                disabled={busy}
                onClick={clearConversation}
              >
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">Clear conversation</span>
              </Button>
            ) : null}
          </div>

          {hasAttachments ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Sources for your next question</p>
                <p className="text-[11px] text-muted-foreground" aria-live="polite">
                  {indexingCount > 0
                    ? `${indexingCount} indexing`
                    : failedDocuments.length > 0
                      ? `${failedDocuments.length} need attention`
                      : hasReady
                        ? `${selectedIds.length} of ${readyIds.length} selected`
                        : "No readable sources"}
                </p>
              </div>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                {snapshot.documents.map((document) => {
                  const selectable = document.status === "ready" && !!document.id;
                  const selected = selectable && selectedIds.includes(document.id!);
                  return (
                    <button
                      key={document.key}
                      type="button"
                      disabled={!selectable || busy}
                      aria-pressed={selected}
                      title={document.error ?? document.name}
                      onClick={() => document.id && toggleSource(document.id)}
                      className={cn(
                        "inline-flex min-w-0 max-w-[18rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-100",
                        selected
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {document.status === "pending" || document.status === "processing" ? (
                        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
                      ) : document.status === "ready" ? (
                        selected ? <Check className="size-3" /> : <FileText className="size-3" />
                      ) : (
                        <AlertTriangle className="size-3" />
                      )}
                      <span>{sourceLabel(document.label)}</span>
                      <span className="truncate font-normal">{document.name}</span>
                    </button>
                  );
                })}
              </div>
              {hasReady && failedDocuments.length > 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-destructive">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" />
                    {failedDocuments.length === 1
                      ? "1 source could not be indexed"
                      : `${failedDocuments.length} sources could not be indexed`}
                  </span>
                  {canManage
                    ? failedDocuments
                        .filter((document) => document.id)
                        .map((document) => (
                          <button
                            key={document.key}
                            type="button"
                            className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            disabled={busy}
                            onClick={() => retry(document.id!)}
                          >
                            Retry {sourceLabel(document.label)}
                          </button>
                        ))
                    : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </SheetHeader>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {!hasReady ? (
            <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                {hasAttachments && indexingCount > 0 ? (
                  <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
                ) : hasAttachments ? (
                  <AlertTriangle className="size-5 text-destructive" />
                ) : (
                  <BookOpenText className="size-5" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="font-medium">
                  {hasAttachments
                    ? indexingCount > 0
                      ? "Preparing agreement search"
                      : "Agreement indexing needs attention"
                    : "No agreement attached"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {hasAttachments
                    ? indexingCount > 0
                      ? "Sastra is reading the documents and preparing their searchable clauses. This view will update automatically."
                      : canManage
                        ? "Retry the failed source below. Sastra reuses parsed text when available, so you do not need to upload the file again."
                        : "Ask a manager to retry the source or upload an accessible copy."
                    : canManage
                      ? "Upload an MoU or License in the matching Rights step, then return here to ask questions."
                      : "Ask a manager to attach an MoU or License to this project's Rights page."}
                </p>
              </div>
              {failedDocuments.length > 0 ? (
                <div className="w-full divide-y rounded-lg border bg-card text-left">
                  {failedDocuments.map((document) => (
                    <div
                      key={document.key}
                      className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-medium">
                          {sourceLabel(document.label)} · {document.name}
                        </p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {document.failureStage === "search"
                            ? "Search index failed. "
                            : document.failureStage === "reading"
                              ? "Document reading failed. "
                              : ""}
                          {friendlyAgreementIndexError(document.error)}
                        </p>
                      </div>
                      {canManage && document.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full shrink-0 sm:w-auto"
                          disabled={busy}
                          onClick={() => retry(document.id!)}
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : snapshot.messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-5 py-8">
              <div className="space-y-1 text-center">
                <h3 className="font-medium">What do you need to verify?</h3>
                <p className="text-sm text-muted-foreground">
                  Ask for a summary, compare documents, find conflicts, or check whether a term is stated.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((starter) => (
                  <Button
                    key={starter}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-auto whitespace-normal text-left"
                    disabled={busy || selectedIds.length === 0}
                    onClick={() => send(starter)}
                  >
                    {starter}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {snapshot.messages.map((message) => (
                <Message key={message.id} message={message} snapshot={snapshot} />
              ))}
              {busy ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                  {progress}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {hasReady ? (
          <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
            <div className="flex items-end gap-2">
              <label className="sr-only" htmlFor="agreement-question">Ask about the selected agreements</label>
              <Textarea
                id="agreement-question"
                rows={2}
                maxLength={4000}
                value={input}
                disabled={busy}
                placeholder={
                  selectedIds.length > 0
                    ? "Ask about the selected agreements…"
                    : "Select at least one source above"
                }
                className="min-h-11 resize-none"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                aria-label="Send agreement question"
                disabled={busy || !input.trim() || selectedIds.length === 0}
                onClick={() => send()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Verify important decisions against citations. Not legal advice.
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
