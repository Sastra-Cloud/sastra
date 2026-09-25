"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Send,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { ChatMessageView } from "@/lib/chat/queries";
import { avatarSrc } from "@/lib/users/avatar";
import {
  deleteMessage,
  markChannelRead,
  postMessage,
  setMessageStatus,
  toggleReaction,
} from "@/lib/chat/actions";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Marker,
  MarkerContent,
  MarkerIcon,
} from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MentionInput } from "@/components/mentions/mention-input";
import { MentionText } from "@/components/mentions/mention-text";
import type { MentionTarget } from "@/lib/mentions/roster";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  VoiceDraftPreview,
  VoiceRecorderControl,
  type VoiceDraft,
} from "@/components/chat/voice-recorder";
import { VoiceMessagePlayer } from "@/components/chat/voice-message-player";
import { useChatNavigation } from "@/components/chat/chat-navigation-context";

const QUICK_EMOJI = ["👍", "❤️", "🎉", "👀", "✅", "😄"];
const NEAR_BOTTOM_PX = 96;

function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

async function uploadToMessage(
  file: File,
  messageId: string,
  label?: "voice"
) {
  const contentType = file.type || "application/octet-stream";
  const presign = await fetch("/api/files/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    }),
  });
  if (!presign.ok) {
    const { error } = await presign.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(error);
  }
  const { fileId, uploadUrl } = await presign.json();
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) throw new Error("Upload failed");
  const complete = await fetch("/api/files/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId,
      targetType: "message",
      targetId: messageId,
      label,
    }),
  });
  if (!complete.ok) {
    const { error } = await complete
      .json()
      .catch(() => ({ error: "Could not finish the upload" }));
    throw new Error(error);
  }
}

export function ChatThread({
  channelId,
  currentUserId,
  currentUserName,
  currentUserImage,
  initialMessages,
  members = [],
  variant = "team",
  contextLabel,
  emptyDescription,
  placeholder,
  loading = false,
  fillAvailable = false,
}: {
  channelId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserImage: string | null;
  initialMessages: ChatMessageView[];
  members?: MentionTarget[];
  variant?: "team" | "project";
  contextLabel?: string;
  emptyDescription?: string;
  placeholder?: string;
  loading?: boolean;
  fillAvailable?: boolean;
}) {
  const { pendingChannelId } = useChatNavigation();
  const conversationLoading =
    loading ||
    (pendingChannelId !== null && pendingChannelId !== channelId);
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [pendingMessages, setPendingMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastReadRef = useRef<string>("");
  const isNearBottomRef = useRef(true);
  const previousLatestMessageIdRef = useRef(
    initialMessages[initialMessages.length - 1]?.id ?? null
  );
  const previousPendingCountRef = useRef(0);

  useEffect(() => {
    if (messages.length === 0) {
      void markChannelRead(channelId, null);
    }
  }, [channelId, messages.length]);

  // Near-real-time: poll the recent window (pauses when the tab is hidden).
  // Robust across dev/proxies; an SSE endpoint also exists for future use.
  useEffect(() => {
    const recentUrl = `/api/chat/${channelId}/recent`;
    let stopped = false;

    const refresh = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(recentUrl);
        if (r.ok && !stopped) setMessages((await r.json()).messages);
      } catch {
        /* transient */
      }
    };

    const interval = setInterval(refresh, 2500);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [channelId]);

  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  const initialLatestMessageId =
    initialMessages[initialMessages.length - 1]?.id ?? null;

  // Enter a conversation at its newest message. Subsequent polling must not
  // disturb someone who has deliberately scrolled up to read history.
  useEffect(() => {
    previousLatestMessageIdRef.current = initialLatestMessageId;
    isNearBottomRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      if (
        initialLatestMessageId &&
        initialLatestMessageId !== lastReadRef.current
      ) {
        lastReadRef.current = initialLatestMessageId;
        void markChannelRead(channelId, initialLatestMessageId);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [channelId, initialLatestMessageId]);

  // Follow genuinely new messages only when the reader was already near the
  // bottom. A poll that returns the same latest message does nothing.
  useEffect(() => {
    const previousId = previousLatestMessageIdRef.current;
    previousLatestMessageIdRef.current = latestMessageId;
    if (
      !latestMessageId ||
      latestMessageId === previousId ||
      !isNearBottomRef.current
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      if (latestMessageId !== lastReadRef.current) {
        lastReadRef.current = latestMessageId;
        void markChannelRead(channelId, latestMessageId);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [channelId, latestMessageId]);

  // Sending is an explicit request to return to the newest message.
  useEffect(() => {
    const previousCount = previousPendingCountRef.current;
    previousPendingCountRef.current = pendingMessages.length;
    if (pendingMessages.length <= previousCount) return;

    isNearBottomRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingMessages.length]);

  function handleThreadScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
    isNearBottomRef.current = nearBottom;
    if (
      nearBottom &&
      latestMessageId &&
      latestMessageId !== lastReadRef.current
    ) {
      lastReadRef.current = latestMessageId;
      void markChannelRead(channelId, latestMessageId);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text && pendingFiles.length === 0 && !voiceDraft) return;
    const voiceAtSend = voiceDraft;
    const files = voiceAtSend
      ? [...pendingFiles, voiceAtSend.file]
      : pendingFiles;
    const hasFiles = files.length > 0;
    const clientNonce = crypto.randomUUID();
    const optimisticMessage: ChatMessageView = {
      id: `pending-${clientNonce}`,
      userId: currentUserId,
      authorName: currentUserName,
      authorImage: currentUserImage,
      content: text || null,
      status: "uploading",
      createdAt: new Date().toISOString(),
      isMine: true,
      reactions: [],
      attachments: [],
    };
    setPendingMessages((current) => [...current, optimisticMessage]);
    setSending(true);
    setInput("");
    setPendingFiles([]);
    try {
      const { id } = await postMessage({
        channelId,
        content: text || undefined,
        status: hasFiles ? "uploading" : "sent",
        clientNonce,
      });
      // Refresh immediately so the message shows without waiting for the next tick.
      const r = await fetch(`/api/chat/${channelId}/recent`);
      if (r.ok) setMessages((await r.json()).messages);
      setPendingMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));

      if (hasFiles) {
        const failedFiles: File[] = [];
        for (const f of files) {
          try {
            await uploadToMessage(
              f,
              id,
              voiceAtSend?.file === f ? "voice" : undefined
            );
          } catch (err) {
            failedFiles.push(f);
            toast.error(`${f.name}: ${(err as Error).message}`);
          }
        }
        await setMessageStatus(
          id,
          failedFiles.length === files.length ? "failed" : "sent"
        );
        if (failedFiles.length > 0) {
          setPendingFiles(
            failedFiles.filter((file) => file !== voiceAtSend?.file)
          );
        }
        if (voiceAtSend && !failedFiles.includes(voiceAtSend.file)) {
          URL.revokeObjectURL(voiceAtSend.url);
          setVoiceDraft(null);
        }
        const r2 = await fetch(`/api/chat/${channelId}/recent`);
        if (r2.ok) setMessages((await r2.json()).messages);
      }
    } catch (error) {
      setPendingMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      setInput(text);
      setPendingFiles(files);
      toast.error(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  function reactTo(messageId: string, emoji: string) {
    let previous: ChatMessageView[] = [];
    setMessages((current) => {
      previous = current;
      return current.map((message) => {
        if (message.id !== messageId) return message;
        const reaction = message.reactions.find((item) => item.emoji === emoji);
        const reactions = reaction
          ? reaction.mine
            ? message.reactions
                .map((item) =>
                  item.emoji === emoji
                    ? { ...item, count: item.count - 1, mine: false }
                    : item
                )
                .filter((item) => item.count > 0)
            : message.reactions.map((item) =>
                item.emoji === emoji
                  ? { ...item, count: item.count + 1, mine: true }
                  : item
              )
          : [...message.reactions, { emoji, count: 1, mine: true }];
        return { ...message, reactions };
      });
    });
    void toggleReaction(messageId, emoji).catch(() => {
      setMessages(previous);
      toast.error("Could not update the reaction.");
    });
  }

  async function removeMessage(messageId: string) {
    if (!(await confirmDialog("Delete this message? This cannot be undone."))) return;
    let previous: ChatMessageView[] = [];
    setMessages((current) => {
      previous = current;
      return current.filter((message) => message.id !== messageId);
    });
    void deleteMessage(messageId).catch(() => {
      setMessages(previous);
      toast.error("Could not delete the message.");
    });
  }

  const visibleMessages = [...messages, ...pendingMessages];

  function discardVoiceDraft() {
    if (!voiceDraft) return;
    URL.revokeObjectURL(voiceDraft.url);
    setVoiceDraft(null);
  }

  function acceptVoiceDraft(nextDraft: VoiceDraft) {
    if (voiceDraft) URL.revokeObjectURL(voiceDraft.url);
    setVoiceDraft(nextDraft);
  }

  const heightClass = fillAvailable
    ? "h-full min-h-0 flex-1"
    : variant === "project"
      ? "h-[calc(100dvh-26rem)] min-h-[20rem] max-h-[34rem]"
      : "h-[calc(100dvh-14rem)] min-h-[32rem]";
  const resolvedContextLabel =
    variant === "project" ? "Project discourse" : "Team discourse";
  const resolvedPlaceholder =
    variant === "project" ? "Message the project..." : "Message the team...";
  const resolvedEmptyDescription =
    variant === "project"
      ? "Share a status note, decision, or file for the project team."
      : "Share an update, decision, or file with the team.";

  return (
    <MessageScrollerProvider>
      <section
        aria-busy={conversationLoading}
        data-chat-thread
        className={cn(
          "surface-shadow flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
          heightClass
        )}
      >
        <MessageScroller className="flex-1 bg-[radial-gradient(circle_at_20%_0%,oklch(0.69_0.14_35_/_0.09),transparent_24rem)]">
          <MessageScrollerViewport
            ref={scrollRef}
            onScroll={handleThreadScroll}
            aria-hidden={conversationLoading}
            inert={conversationLoading}
            className={cn(
              "p-3 transition-opacity duration-150 md:p-5",
              conversationLoading && "opacity-0"
            )}
          >
            <MessageScrollerContent
              className={cn(fillAvailable && "max-lg:justify-end")}
            >
              <Marker
                variant="separator"
                className={cn(
                  "text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
                  fillAvailable && "max-lg:hidden"
                )}
              >
                <MarkerContent>{contextLabel ?? resolvedContextLabel}</MarkerContent>
              </Marker>

              {visibleMessages.length === 0 ? (
                <Marker className="mx-auto my-8 w-full max-w-sm flex-col items-center justify-center rounded-xl border border-dashed bg-background/45 px-5 py-8 text-center md:my-auto md:px-6 md:py-10">
                  <MarkerIcon className="size-10 rounded-xl bg-primary/12 p-2 text-primary">
                    <Send className="size-5" />
                  </MarkerIcon>
                  <MarkerContent className="mt-3 space-y-1">
                    <span className="block font-heading text-lg font-semibold text-foreground">
                      Start the thread
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {emptyDescription ?? resolvedEmptyDescription}
                    </span>
                  </MarkerContent>
                </Marker>
              ) : (
                visibleMessages.map((m, index) => (
                  <MessageScrollerItem
                    key={m.id}
                    scrollAnchor={index === visibleMessages.length - 1}
                    className={cn(m.id.startsWith("pending-") && "optimistic-item-in")}
                  >
                    <MessageRow
                      m={m}
                      isOwn={m.userId === currentUserId}
                      members={members}
                      currentUserId={currentUserId}
                      onReact={(emoji) => reactTo(m.id, emoji)}
                      onDelete={() => removeMessage(m.id)}
                    />
                  </MessageScrollerItem>
                ))
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          {!conversationLoading ? (
            <MessageScrollerButton direction="end" className="bottom-3" />
          ) : null}
          {conversationLoading ? <ConversationLoadingState /> : null}
        </MessageScroller>

        {pendingFiles.length > 0 || voiceDraft ? (
          <div className="shrink-0 space-y-2 border-t bg-background/55 px-3 py-2.5 sm:px-4">
            {voiceDraft ? (
              <VoiceDraftPreview
                draft={voiceDraft}
                disabled={sending}
                onDiscard={discardVoiceDraft}
              />
            ) : null}
            {pendingFiles.length > 0 ? (
              <AttachmentGroup className="gap-2">
              {pendingFiles.map((f, i) => (
                <Attachment key={`${f.name}-${i}`} state="idle" size="xs">
                  <AttachmentMedia className="bg-primary/10 text-primary">
                    <Paperclip className="size-3.5" />
                  </AttachmentMedia>
                  <AttachmentContent className="min-w-36 max-w-64">
                    <AttachmentTitle>{f.name}</AttachmentTitle>
                    <AttachmentDescription>{formatBytes(f.size)}</AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <AttachmentAction
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() =>
                        setPendingFiles((p) => p.filter((_, j) => j !== i))
                      }
                    >
                      <X className="size-3" />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              ))}
              </AttachmentGroup>
            ) : null}
            {voiceDraft ? (
              <p className="px-1 text-xs text-muted-foreground">
                Add a short note or transcript below so the message can be read
                without audio.
              </p>
            ) : null}
          </div>
        ) : null}

        <div
          data-chat-composer
          className="flex shrink-0 items-end gap-1.5 border-t bg-background/92 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:p-3"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) =>
              setPendingFiles((p) => [...p, ...Array.from(e.target.files ?? [])])
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:size-10"
            aria-label="Attach files"
            disabled={conversationLoading || sending || recordingVoice}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip className="size-4" />
          </Button>
          <VoiceRecorderControl
            disabled={conversationLoading || sending}
            hasDraft={voiceDraft !== null}
            onRecorded={acceptVoiceDraft}
            onRecordingChange={setRecordingVoice}
          />
          {!recordingVoice ? (
            <>
              <MentionInput
                value={input}
                onChange={setInput}
                members={members}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  voiceDraft
                    ? "Add a note (optional)..."
                    : placeholder ?? resolvedPlaceholder
                }
                disabled={conversationLoading}
                rows={1}
                containerClassName="flex-1"
                className="max-h-36 min-h-11 w-full resize-none rounded-xl bg-card px-3.5 py-2.5 text-base shadow-none sm:text-sm"
              />
              <Button
                size="icon"
                className="size-11 lg:size-10"
                aria-label="Send"
                disabled={
                  conversationLoading ||
                  sending ||
                  (!input.trim() &&
                    pendingFiles.length === 0 &&
                    voiceDraft === null)
                }
                onClick={() => void send()}
              >
                {sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </>
          ) : null}
        </div>
      </section>
    </MessageScrollerProvider>
  );
}

function ConversationLoadingState() {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-card/82 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
      aria-label="Loading messages"
    >
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-background/92 px-5 py-4 shadow-sm">
        <Loader2
          aria-hidden="true"
          className="size-6 animate-spin text-primary motion-reduce:animate-none"
        />
        <span className="text-sm font-medium text-muted-foreground">
          Loading messages…
        </span>
      </div>
    </div>
  );
}

function MessageRow({
  m,
  isOwn,
  members,
  currentUserId,
  onReact,
  onDelete,
}: {
  m: ChatMessageView;
  isOwn: boolean;
  members: MentionTarget[];
  currentUserId: string;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const initials = (m.authorName ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const photo = avatarSrc(m.authorImage);

  return (
    <Message
      align={isOwn ? "end" : "start"}
      className="items-end gap-2 sm:gap-3"
    >
      <MessageAvatar
        className={cn(
          "size-9 rounded-xl border text-xs font-semibold shadow-sm",
          isOwn
            ? "border-primary/20 bg-primary/15 text-primary"
            : "border-border bg-background text-muted-foreground"
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={m.authorName ?? "Avatar"}
            className="size-full object-cover"
          />
        ) : (
          initials
        )}
      </MessageAvatar>
      <MessageContent className="max-w-[min(42rem,calc(100%-3.25rem))]">
        <MessageHeader
          className={cn(
            "gap-2 px-1",
            isOwn ? "justify-end" : "justify-start"
          )}
        >
          <span className="truncate font-semibold text-foreground">
            {m.authorName ?? "Unknown"}
          </span>
          <span className="shrink-0 tabular-nums">{timeLabel(m.createdAt)}</span>
          {m.status === "uploading" ? (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              {m.attachments.length > 0 ? "uploading" : "sending"}
            </span>
          ) : m.status === "failed" ? (
            <span className="shrink-0 text-destructive">attachment failed</span>
          ) : null}
        </MessageHeader>

        {m.content ? (
          <Bubble
            variant={isOwn ? "default" : "secondary"}
            align={isOwn ? "end" : "start"}
            className={cn(m.reactions.length > 0 && "mb-3")}
          >
            <BubbleContent
              className={cn(
                "whitespace-pre-wrap text-pretty shadow-sm",
                isOwn
                  ? "bg-primary text-primary-foreground"
                  : "border-border/70 bg-background/80 text-foreground"
              )}
            >
              <MentionText
                text={m.content}
                members={members}
                currentUserId={currentUserId}
                tone={isOwn ? "onPrimary" : "default"}
              />
            </BubbleContent>
            {m.reactions.length > 0 ? (
              <BubbleReactions
                align={isOwn ? "end" : "start"}
                className="ring-card/90"
              >
                {m.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => onReact(r.emoji)}
                    className={cn(
                      "inline-flex min-h-7 items-center gap-1 rounded-full px-2 text-xs transition-colors",
                      r.mine
                        ? "bg-primary/15 text-primary"
                        : "hover:bg-background"
                    )}
                  >
                    <span>{r.emoji}</span>
                    <span className="tabular-nums">{r.count}</span>
                  </button>
                ))}
              </BubbleReactions>
            ) : null}
          </Bubble>
        ) : null}

        {m.attachments.length > 0 ? (
          <AttachmentGroup
            className={cn(
              "max-w-full gap-2 py-0",
              isOwn ? "justify-end" : "justify-start"
            )}
          >
            {m.attachments.map((a) => (
              a.mimeType.startsWith("audio/") && a.label === "voice" ? (
                <VoiceMessagePlayer
                  key={a.attachmentId}
                  src={`/api/files/${a.fileId}/download?inline=1`}
                  isOwn={isOwn}
                />
              ) : (
              <Attachment
                key={a.attachmentId}
                size="sm"
                state={m.status === "uploading" ? "uploading" : "done"}
                className="max-w-[18rem] bg-background/80"
              >
                <AttachmentMedia className="bg-accent text-accent-foreground">
                  <FileText className="size-4" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{a.originalName}</AttachmentTitle>
                  <AttachmentDescription>
                    {formatBytes(a.sizeBytes)}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    render={<a href={`/api/files/${a.fileId}/download`} />}
                    aria-label={`Download ${a.originalName}`}
                  >
                    <Download className="size-3.5" />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
              )
            ))}
          </AttachmentGroup>
        ) : null}

        <MessageFooter
          className={cn(
            "gap-1 px-1 transition-opacity md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100",
            isOwn ? "justify-end" : "justify-start"
          )}
        >
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label="Add reaction"
                  className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:size-9"
                />
              }
            >
              <SmilePlus className="size-4" />
            </PopoverTrigger>
            <PopoverContent className="flex w-auto gap-1 p-1.5">
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onReact(e)}
                  className="flex size-11 items-center justify-center rounded-lg text-base transition-colors hover:bg-secondary lg:size-9"
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {isOwn ? (
            <button
              type="button"
              aria-label="Delete message"
              onClick={onDelete}
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:size-9"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
