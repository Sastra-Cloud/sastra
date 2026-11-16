"use client";

import { FileLink } from "@/components/files/file-link";
import { elementTiming, useUsefulWork } from "@/components/observability/use-useful-work";

import { confirmDialog } from "@/lib/dialog-requests";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pin,
  Reply,
  Send,
  X,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import type { ChatMessageView } from "@/lib/chat/queries";
import { clipboardImageFiles } from "@/lib/chat/clipboard";
import { replyPreview, type ChatReplyPreview } from "@/lib/chat/replies";
import { pinnedByLabel, type ChatPinnedMessage } from "@/lib/chat/pin-state";
import { useUserActive } from "@/hooks/use-user-active";
import { syncChannelRead } from "@/lib/chat/read-client";
import { avatarSrc } from "@/lib/users/avatar";
import {
  deleteMessage,
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
import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
import { MentionInput } from "@/components/mentions/mention-input";
import { MessageText } from "@/components/chat/message-text";
import { MessageLinkPreview } from "@/components/chat/message-link-preview";
import { firstMessageLink } from "@/lib/chat/message-links";
import type { MentionTarget } from "@/lib/mentions/roster";
import { hasChannelMention } from "@/lib/mentions/parse";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  VoiceDraftPreview,
  VoiceRecorderControl,
  type VoiceDraft,
} from "@/components/chat/voice-recorder";
import { VoiceMessagePlayer } from "@/components/chat/voice-message-player";
import { useChatNavigation } from "@/components/chat/chat-navigation-context";
import { useMessagePins } from "@/components/chat/message-pins";
import { ChatImageGallery } from "@/components/chat/chat-image-gallery";
import { ChatFileProgress, ChatVideoPlayer, ChatVideoQualityControl, type ChatAttachmentProgress } from "@/components/chat/chat-video";
import { CHAT_VIDEO_INPUT_BYTES, isChatVideo, type ChatVideoQuality, type ChatVideoResult } from "@/lib/chat/video";
import { uploadContentType, validateUpload } from "@/lib/files/upload-rules";
import { prepareChatVideo } from "@/lib/chat/video-client";
import { uploadFileBytes } from "@/lib/files/upload-progress";
import { conversationDay, continuesMessageGroup } from "@/lib/chat/conversation";
import { sendOnConversationKey } from "@/lib/chat/composer-key";
import { MessageActions } from "@/components/chat/message-actions";
import { MessageReactions } from "@/components/chat/message-reactions";
import { MessageReceipt } from "@/components/chat/message-receipt";
import { MessageEditor } from "@/components/chat/message-editor";
import { editMessage } from "@/lib/chat/edit-actions";
import { reconcileDeletedMessages, reconcileMessageEdits, restoreDeletedMessage, type MessageEditDraft } from "@/lib/chat/edit-state";
import { reconcileReactionMessages } from "@/lib/chat/reaction-state";
import { useFrequentReactions } from "@/components/chat/use-frequent-reactions";
import { reuseChatSnapshot } from "@/lib/chat/snapshot";
import { prepareVoiceMessage } from "@/lib/chat/voice-client";
import type { PreparedVoice, VoiceMetadata } from "@/lib/chat/voice-metadata";

const EMPTY_MEMBERS: MentionTarget[] = [];

function timeLabel(iso: string, timeZone?: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit" });
}

async function uploadToMessage(
  file: File,
  messageId: string,
  label?: "voice",
  onProgress?: (progress: number) => void,
  audioMetadata?: VoiceMetadata,
) {
  const contentType = uploadContentType(file);
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
  if (onProgress) {
    await uploadFileBytes(uploadUrl, file, onProgress);
  } else {
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!put.ok) throw new Error("Upload failed");
  }
  const complete = await fetch("/api/files/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileId,
      targetType: "message",
      targetId: messageId,
      label,
      audioMetadata,
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
  members = EMPTY_MEMBERS,
  variant = "team",
  contextLabel,
  emptyDescription,
  placeholder,
  loading = false,
  fillAvailable = false,
  direct = false,
  timeZone,
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
  direct?: boolean;
  timeZone?: string;
}) {
  const { pendingChannelId } = useChatNavigation();
  const pins = useMessagePins();
  const { beginPinsFetch } = pins;
  const { emojis: frequentEmojis, refresh: refreshFrequentReactions } = useFrequentReactions(currentUserId);
  const conversationLoading =
    loading ||
    (pendingChannelId !== null && pendingChannelId !== channelId);
  useUsefulWork({
    active: !conversationLoading,
    scope: channelId,
    ready: "chat-composer-ready",
    visible: { name: "chat-messages-visible", element: "chat-messages" },
  });
  const channelMentions = !direct;
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [pendingMessages, setPendingMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatReplyPreview | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [videoQuality, setVideoQuality] = useState<ChatVideoQuality>("standard");
  const [fileProgress, setFileProgress] = useState<ChatAttachmentProgress | null>(null);
  const sendGuard = useRef(false);
  const sendController = useRef<AbortController | null>(null);
  const preparedVideos = useRef(new WeakMap<File, { quality: ChatVideoQuality; result: ChatVideoResult }>());
  const [reacting, setReacting] = useState<Set<string>>(new Set());
  const reactingRef = useRef(new Set<string>());
  const reactionVersions = useRef(new Map<string, number>());
  const [editing, setEditing] = useState<MessageEditDraft | null>(null);
  const [restoreComposerFocus, setRestoreComposerFocus] = useState(false);
  const [savingEdits, setSavingEdits] = useState<Set<string>>(new Set());
  const editingRef = useRef(new Set<string>());
  const editVersions = useRef(new Map<string, number>());
  const failedEditDrafts = useRef(new Map<string, MessageEditDraft>());
  const deletingRef = useRef(new Set<string>());
  const confirmingDeletes = useRef(new Set<string>());
  const deletionVersions = useRef(new Map<string, number>());
  const receiveMessages = useCallback((incoming: ChatMessageView[], requestedVersions: Map<string, number>, requestedEdits: Map<string, number>, requestedDeletes: Map<string, number>) => {
    const protectedIds = new Set(reactingRef.current);
    for (const [id, version] of reactionVersions.current) {
      if (requestedVersions.get(id) !== version) protectedIds.add(id);
    }
    const protectedEdits = new Set(editingRef.current);
    for (const [id, version] of editVersions.current) {
      if (requestedEdits.get(id) !== version) protectedEdits.add(id);
    }
    const pendingDeletes = new Set(deletingRef.current);
    const changedDeletes = new Set<string>();
    for (const [id, version] of deletionVersions.current) {
      if (requestedDeletes.get(id) !== version) changedDeletes.add(id);
    }
    setMessages(current => reuseChatSnapshot(current, reconcileDeletedMessages(current, reconcileMessageEdits(current, reconcileReactionMessages(current, incoming, protectedIds), protectedEdits), pendingDeletes, changedDeletes)));
  }, []);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const fileDragDepth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastReadRef = useRef<string>("");
  const followingLatestRef = useRef(true);
  const touchYRef = useRef<number | null>(null);
  const previousLatestMessageIdRef = useRef(
    initialMessages[initialMessages.length - 1]?.id ?? null
  );
  const previousPendingCountRef = useRef(0);

  useEffect(() => () => { sendController.current?.abort(); }, [channelId]);

  useEffect(() => {
    if (messages.length === 0) {
      void syncChannelRead(channelId, null, currentUserId);
    }
  }, [channelId, messages.length, currentUserId]);

  // Near-real-time: poll the recent window while the user is active (pauses
  // when the tab is hidden or idle for ten minutes, and catches up on return).
  // Robust across dev/proxies; an SSE endpoint also exists for future use.
  const active = useUserActive();
  useEffect(() => {
    if (!active) return;
    const recentUrl = `/api/chat/${channelId}/recent`;
    let stopped = false;
    let controller: AbortController | null = null;

    const refresh = async () => {
      // Slow mobile requests must not pile up or race newer snapshots.
      if (document.hidden || controller) return;
      const request = new AbortController();
      controller = request;
      try {
        const requestedVersions = new Map(reactionVersions.current);
        const requestedEdits = new Map(editVersions.current);
        const requestedDeletes = new Map(deletionVersions.current);
        const receivePins = beginPinsFetch();
        const r = await fetch(recentUrl, { signal: request.signal, cache: "no-store" });
        if (!r.ok || stopped || request.signal.aborted) return;
        const data = await r.json();
        if (stopped) return;
        receiveMessages(data.messages, requestedVersions, requestedEdits, requestedDeletes);
        receivePins(data.pins ?? []);
      } catch {
        /* transient */
      } finally {
        if (controller === request) controller = null;
      }
    };

    // A route-cache hit can reopen an older snapshot. Catch up immediately on
    // mount/resume instead of waiting for the first polling interval.
    void refresh();
    const interval = setInterval(refresh, 2500);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [channelId, active, beginPinsFetch, receiveMessages]);

  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  const initialLatestMessageId =
    initialMessages[initialMessages.length - 1]?.id ?? null;

  const followLatest = useCallback(() => {
    const viewport = scrollRef.current;
    if (!followingLatestRef.current || !viewport || viewport.clientHeight === 0) return;
    const end = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    if (Math.abs(viewport.scrollTop - end) > 1) viewport.scrollTop = end;
  }, []);

  // A reopened/cached conversation starts at its newest message. Keep following
  // as fonts, media, headers and the available viewport settle after this frame.
  useEffect(() => {
    let frame = 0;
    const enter = (lastMessageId = initialLatestMessageId) => {
      previousLatestMessageIdRef.current = lastMessageId;
      followingLatestRef.current = true;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        followLatest();
        // Record every visit, including reopening an already-read conversation.
        if (lastMessageId && !document.hidden && !conversationLoading && scrollRef.current?.clientHeight) {
          lastReadRef.current = lastMessageId;
          void syncChannelRead(channelId, lastMessageId, currentUserId);
        }
      });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) enter(previousLatestMessageIdRef.current);
    };
    enter();
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [channelId, initialLatestMessageId, currentUserId, followLatest, conversationLoading]);

  useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const observer = new ResizeObserver(followLatest);
    observer.observe(content);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [channelId, followLatest]);

  // Follow genuinely new messages only while the reader is following the latest
  // replies. A poll that returns the same latest message does nothing.
  useEffect(() => {
    const previousId = previousLatestMessageIdRef.current;
    previousLatestMessageIdRef.current = latestMessageId;
    if (
      !latestMessageId ||
      latestMessageId === previousId ||
      !followingLatestRef.current
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      followLatest();
      if (latestMessageId !== lastReadRef.current && !document.hidden && !conversationLoading && scrollRef.current?.clientHeight) {
        lastReadRef.current = latestMessageId;
        void syncChannelRead(channelId, latestMessageId, currentUserId);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [channelId, latestMessageId, currentUserId, followLatest, conversationLoading]);

  // Sending is an explicit request to return to the newest message.
  useEffect(() => {
    const previousCount = previousPendingCountRef.current;
    previousPendingCountRef.current = pendingMessages.length;
    if (pendingMessages.length <= previousCount) return;

    followingLatestRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      followLatest();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingMessages.length, followLatest]);

  const handleThreadScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= 1;
    // Scroll events also come from image/layout shifts and restored positions.
    // Only an explicit history gesture pauses following; reaching the end opts in.
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= 1) {
      followingLatestRef.current = true;
    }
    if (
      atBottom &&
      !document.hidden &&
      !conversationLoading &&
      el.clientHeight > 0 &&
      latestMessageId &&
      latestMessageId !== lastReadRef.current
    ) {
      lastReadRef.current = latestMessageId;
      void syncChannelRead(channelId, latestMessageId, currentUserId);
    }
  }, [channelId, currentUserId, latestMessageId, conversationLoading]);

  // Returning to a visible chat can expose the same latest message without a
  // new-message or scroll event. Preserve deliberate history reading on return.
  useEffect(() => {
    document.addEventListener("visibilitychange", handleThreadScroll);
    window.addEventListener("focus", handleThreadScroll);
    return () => {
      document.removeEventListener("visibilitychange", handleThreadScroll);
      window.removeEventListener("focus", handleThreadScroll);
    };
  }, [handleThreadScroll]);

  const refreshRecent = useCallback(async () => {
    const requestedVersions = new Map(reactionVersions.current);
    const requestedEdits = new Map(editVersions.current);
    const requestedDeletes = new Map(deletionVersions.current);
    const receivePins = beginPinsFetch();
    const r = await fetch(`/api/chat/${channelId}/recent`);
    if (!r.ok) return;
    const data = await r.json();
    receiveMessages(data.messages, requestedVersions, requestedEdits, requestedDeletes);
    receivePins(data.pins ?? []);
  }, [beginPinsFetch, channelId, receiveMessages]);

  async function send() {
    if (sendGuard.current || sending || conversationLoading || recordingVoice || editing) return;
    const draftText = input;
    const replyAtSend = replyTarget;
    const text = input.trim();
    if (!text && pendingFiles.length === 0 && !voiceDraft) return;
    sendGuard.current = true;
    if (channelMentions && hasChannelMention(text, members)) {
      let confirmed = false;
      try {
        confirmed = await confirmDialog(
          "This message will notify everyone in this channel. Use this for important updates.",
          { title: "Notify everyone?", confirmLabel: "Send and notify" }
        );
      } finally {
        if (!confirmed) sendGuard.current = false;
      }
      if (!confirmed) return;
    }
    const controller = new AbortController();
    sendController.current = controller;
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
      editedAt: null,
      isMine: true,
      reactions: [],
      attachments: [],
      replyTo: replyAtSend,
    };
    setPendingMessages((current) => [...current, optimisticMessage]);
    setSending(true);
    setSendError(null);
    setInput("");
    setReplyTarget(null);
    let created = false;
    try {
      // Prepare serially before creating a server message. Cancellation or a bad
      // codec must not leave an empty message or send the remaining files.
      const uploadFiles: File[] = [];
      let preparedVoice: PreparedVoice | undefined;
      for (const file of files) {
        if (file === voiceAtSend?.file) {
          setFileProgress({ phase: "preparing", fileName: file.name, progress: null, kind: "voice" });
          preparedVoice = await prepareVoiceMessage(file, voiceAtSend.durationMs, controller.signal);
          controller.signal.throwIfAborted();
          uploadFiles.push(preparedVoice.file);
          continue;
        }
        if (!isChatVideo(file)) { uploadFiles.push(file); continue; }
        setFileProgress({ phase: "preparing", fileName: file.name, progress: null });
        const cached = preparedVideos.current.get(file);
        const result = cached?.quality === videoQuality ? cached.result
          : await prepareChatVideo(file, videoQuality, controller.signal, value => {
            setFileProgress({ phase: "preparing", fileName: file.name, ...value });
          });
        controller.signal.throwIfAborted();
        preparedVideos.current.set(file, { quality: videoQuality, result });
        uploadFiles.push(result.file);
      }
      controller.signal.throwIfAborted();
      setFileProgress(null);
      const { id } = await postMessage({
        channelId,
        content: text || undefined,
        status: hasFiles ? "uploading" : "sent",
        clientNonce,
        replyToId: replyAtSend?.messageId,
      });
      created = true;
      setMessages((current) => current.some((message) => message.id === id) ? current : [...current, {
        ...optimisticMessage,
        id,
        status: hasFiles ? "uploading" : "sent",
      }]);
      setPendingMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      // Refresh immediately so the message shows without waiting for the next tick.
      await refreshRecent().catch(() => {});

      if (hasFiles) {
        const failedFiles: File[] = [];
        for (const [index, f] of uploadFiles.entries()) {
          const video = files[index] !== voiceAtSend?.file && isChatVideo(files[index]);
          try {
            if (video) setFileProgress({ phase: "uploading", fileName: f.name, progress: 0 });
            await uploadToMessage(
              f,
              id,
              voiceAtSend?.file === files[index] ? "voice" : undefined,
              video || voiceAtSend?.file === files[index] ? progress => setFileProgress({
                phase: progress === 1 ? "finishing" : "uploading", fileName: f.name,
                progress: progress === 1 ? null : progress,
              }) : undefined,
              voiceAtSend?.file === files[index] ? preparedVoice?.metadata : undefined,
            );
          } catch (err) {
            failedFiles.push(files[index]);
            const error = err instanceof Error && !(err instanceof TypeError) ? err.message
              : "Upload failed. Check your connection and try again.";
            toast.error(`${f.name}: ${error}`);
          } finally {
            setFileProgress(null);
          }
        }
        await setMessageStatus(
          id,
          failedFiles.length === files.length ? "failed" : "sent"
        );
        setPendingFiles(
          failedFiles.filter((file) => file !== voiceAtSend?.file)
        );
        if (voiceAtSend && !failedFiles.includes(voiceAtSend.file)) {
          setVoiceDraft(null);
        }
        await refreshRecent().catch(() => {});
      }
    } catch (error) {
      setPendingMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      if (!created) {
        setInput((current) => current && draftText ? `${draftText}\n${current}` : current || draftText);
        setReplyTarget(replyAtSend);
        setPendingFiles(pendingFiles);
      }
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error && !(error instanceof TypeError)
        ? error.message
        : "Could not send. Check your connection and try again.";
      if (!created) setSendError(message);
      toast.error(message);
    } finally {
      setFileProgress(null);
      sendController.current = null;
      sendGuard.current = false;
      setSending(false);
    }
  }

  const reactTo = useCallback((messageId: string, emoji: string) => {
    if (reactingRef.current.has(messageId)) return;
    reactingRef.current.add(messageId);
    reactionVersions.current.set(messageId, (reactionVersions.current.get(messageId) ?? 0) + 1);
    setReacting((current) => new Set(current).add(messageId));
    let previous: ChatMessageView["reactions"] | undefined;
    setMessages((current) => {
      return current.map((message) => {
        if (message.id !== messageId) return message;
        previous = message.reactions;
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
    void toggleReaction(messageId, emoji).then(() => {
      refreshFrequentReactions();
      reactingRef.current.delete(messageId);
      reactionVersions.current.set(messageId, (reactionVersions.current.get(messageId) ?? 0) + 1);
      // A failed reconciliation read must not undo a successful server mutation.
      return refreshRecent().catch(() => {});
    }).catch(() => {
      setMessages((current) => current.map((message) => message.id === messageId && previous ? { ...message, reactions: previous } : message));
      toast.error("Could not update the reaction.");
    }).finally(() => {
      reactingRef.current.delete(messageId);
      setReacting((current) => {
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
    });
  }, [refreshRecent, refreshFrequentReactions]);

  const beginEdit = useCallback((message: ChatMessageView) => {
    if (editing || sending || recordingVoice || editingRef.current.has(message.id) || message.userId !== currentUserId || !message.content || message.status !== "sent") return;
    const failed = failedEditDrafts.current.get(message.id);
    setRestoreComposerFocus(false);
    setEditing({ messageId: message.id, originalContent: message.content, originalEditedAt: message.editedAt ?? null, text: failed?.text ?? message.content });
  }, [currentUserId, editing, recordingVoice, sending]);

  function cancelEdit() {
    if (editing) failedEditDrafts.current.delete(editing.messageId);
    setEditing(null);
    setRestoreComposerFocus(true);
  }

  function saveEdit() {
    if (!editing || editingRef.current.has(editing.messageId)) return;
    const draft = editing;
    const content = draft.text.trim();
    if (!content || content.length > 20000 || content === draft.originalContent) return;
    editingRef.current.add(draft.messageId);
    editVersions.current.set(draft.messageId, (editVersions.current.get(draft.messageId) ?? 0) + 1);
    setSavingEdits(current => new Set(current).add(draft.messageId));
    setMessages(current => current.map(message => message.id === draft.messageId ? { ...message, content, editedAt: new Date().toISOString() } : message));
    setEditing(null);
    setRestoreComposerFocus(true);
    startTransition(async () => {
      try {
        const result = await editMessage({ messageId: draft.messageId, content, expectedContent: draft.originalContent, expectedEditedAt: draft.originalEditedAt });
        if (!result.ok) throw new Error(result.error.message);
        if (!result.data) throw new Error("Could not save the message.");
        const saved = result.data;
        setMessages(current => current.map(message => message.id === saved.id ? { ...message, content: saved.content, editedAt: saved.editedAt } : message));
        failedEditDrafts.current.delete(draft.messageId);
      } catch (error) {
        const message = error instanceof Error && !(error instanceof TypeError) ? error.message : "Could not save the message. Your changes are kept below.";
        setMessages(current => current.map(item => item.id === draft.messageId ? { ...item, content: draft.originalContent, editedAt: draft.originalEditedAt } : item));
        const failed = { ...draft, error: message };
        failedEditDrafts.current.set(draft.messageId, failed);
        setEditing(current => current ?? failed);
        toast.error(message);
      } finally {
        editingRef.current.delete(draft.messageId);
        editVersions.current.set(draft.messageId, (editVersions.current.get(draft.messageId) ?? 0) + 1);
        setSavingEdits(current => { const next = new Set(current); next.delete(draft.messageId); return next; });
        void refreshRecent().catch(() => {});
      }
    });
  }

  const removeMessage = useCallback(async (messageId: string) => {
    if (editingRef.current.has(messageId) || deletingRef.current.has(messageId) || confirmingDeletes.current.has(messageId)) return;
    confirmingDeletes.current.add(messageId);
    let confirmed = false;
    try { confirmed = await confirmDialog("Delete this message? This cannot be undone."); }
    finally { confirmingDeletes.current.delete(messageId); }
    if (!confirmed) return;
    deletingRef.current.add(messageId);
    deletionVersions.current.set(messageId, (deletionVersions.current.get(messageId) ?? 0) + 1);
    let removed: ChatMessageView | undefined;
    const editAtDelete = editing?.messageId === messageId ? editing : null;
    if (editAtDelete) { setEditing(null); setRestoreComposerFocus(true); }
    setMessages((current) => {
      removed = current.find(message => message.id === messageId);
      return current.filter((message) => message.id !== messageId);
    });
    const request = deleteMessage(messageId);
    const settled = () => {
      deletingRef.current.delete(messageId);
      deletionVersions.current.set(messageId, (deletionVersions.current.get(messageId) ?? 0) + 1);
    };
    // Deleting a message also removes its pin for everyone.
    pins.forgetMessage(messageId, request);
    void request.then(() => { settled(); refreshFrequentReactions(); }).catch(() => {
      settled();
      setMessages(current => removed ? restoreDeletedMessage(current, removed) : current);
      if (editAtDelete) setEditing(current => current ?? editAtDelete);
      toast.error("Could not delete the message.");
    });
  }, [editing, pins, refreshFrequentReactions]);

  const togglePin = useCallback((message: ChatMessageView) => {
    if (pins.pinFor(message.id)) pins.unpin(message.id);
    else pins.pin(message);
  }, [pins]);

  const startReply = useCallback((message: ChatMessageView) => {
    if (conversationLoading || sending || recordingVoice || editing || message.id.startsWith("pending-")) return;
    setReplyTarget(replyPreview(message));
    setSendError(null);
  }, [conversationLoading, editing, recordingVoice, sending]);

  const showOriginal = useCallback((messageId: string) => {
    const element = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (!element) {
      toast.info("This message is older than the recent messages shown here.");
      return;
    }
    followingLatestRef.current = false;
    element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    element.focus({ preventScroll: true });
    element.dataset.pinHighlight = "true";
    window.setTimeout(() => { delete element.dataset.pinHighlight; }, 1800);
  }, []);

  // Another person's message whose only attachment failed has nothing to
  // show. The sender still sees it, so they know to try again.
  const visibleMessages = useMemo(
    () => [...messages, ...pendingMessages].filter(
      (m) => m.isMine || m.status !== "failed" || Boolean(m.content) || m.attachments.length > 0,
    ),
    [messages, pendingMessages],
  );

  function discardVoiceDraft() {
    if (!voiceDraft) return;
    setVoiceDraft(null);
  }

  function acceptVoiceDraft(nextDraft: VoiceDraft) {
    setVoiceDraft(nextDraft);
  }

  const attachmentsDisabled = conversationLoading || sending || recordingVoice || editing !== null;

  function addPendingFiles(files: File[]) {
    if (attachmentsDisabled || files.length === 0) return;
    const accepted = files.filter(file => {
      if (isChatVideo(file) && file.size > CHAT_VIDEO_INPUT_BYTES) {
        toast.error(`${file.name}: Choose a video under 500 MB, shorten it, or share a link.`);
        return false;
      }
      // Videos are made smaller before upload, so their size is checked above.
      // Refuse other files the server will not store now, before a message
      // exists: a refused file must not leave an empty failed message or stay
      // in the composer and fail the next message too.
      const refused = isChatVideo(file) ? null : validateUpload(uploadContentType(file), file.size);
      if (refused) {
        toast.error(`${file.name}: ${refused}`);
        return false;
      }
      return true;
    });
    setPendingFiles((current) => [...current, ...accepted]);
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

  // Draft keystrokes must not reformat dates, parse links/mentions, or render
  // the history's menus and attachments. Keep the transcript element tree
  // until its data or available actions actually change.
  const messageRows = useMemo(() => (
    visibleMessages.map((m, index) => (
      <MessageScrollerItem
        key={m.id}
        data-message-id={m.id}
        tabIndex={-1}
        className={cn(
          "rounded-xl transition-colors duration-500 motion-reduce:transition-none data-[pin-highlight=true]:bg-primary/10",
          continuesMessageGroup(visibleMessages[index - 1], m, timeZone) ? "pt-1" : "pt-3",
          m.id.startsWith("pending-") && "optimistic-item-in"
        )}
      >
        {(!visibleMessages[index - 1] || conversationDay(visibleMessages[index - 1].createdAt, timeZone) !== conversationDay(m.createdAt, timeZone)) ? (
          <p className="mb-3 pt-1 text-center text-[11px] leading-4 text-muted-foreground"><time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleDateString("en", { timeZone, dateStyle: "medium" })}</time></p>
        ) : null}
        <MessageRow
          m={m}
          isOwn={m.userId === currentUserId}
          members={members}
          currentUserId={currentUserId}
          pin={pins.pinFor(m.id)}
          pinPending={pins.isPending(m.id)}
          // This callback runs on a reaction gesture, never during render.
          // eslint-disable-next-line react-hooks/refs
          onReact={(emoji) => reactTo(m.id, emoji)}
          // Deferred message actions read their guards only after a gesture.
          // eslint-disable-next-line react-hooks/refs
          onDelete={() => removeMessage(m.id)}
          // eslint-disable-next-line react-hooks/refs
          onEdit={() => beginEdit(m)}
          editDisabled={editing !== null || sending || recordingVoice || savingEdits.has(m.id)}
          editPending={savingEdits.has(m.id)}
          onTogglePin={() => togglePin(m)}
          onReply={() => startReply(m)}
          onShowOriginal={showOriginal}
          replyDisabled={conversationLoading || sending || recordingVoice || editing !== null}
          showAuthor={!direct && !continuesMessageGroup(visibleMessages[index - 1], m, timeZone)}
          showTime={!continuesMessageGroup(m, visibleMessages[index + 1] ?? { userId: null, createdAt: m.createdAt }, timeZone)}
          direct={direct}
          channelMentions={channelMentions}
          timeZone={timeZone}
          reactionPending={reacting.has(m.id)}
          frequentEmojis={frequentEmojis}
          // The chat opens at the newest message, so that is the first one painted.
          timingId={index === visibleMessages.length - 1 ? "chat-messages" : undefined}
        />
      </MessageScrollerItem>
    ))
  ), [visibleMessages, timeZone, currentUserId, members, pins, reactTo,
    removeMessage, beginEdit, editing, sending, recordingVoice, savingEdits,
    togglePin, startReply, showOriginal, conversationLoading, direct,
    channelMentions, reacting, frequentEmojis]);

  // Keep the scroll controller, observers, and viewport out of draft updates,
  // as well as the message rows. The input is a sibling of this stable tree.
  const transcript = useMemo(() => (
    <MessageScrollerProvider>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport
          ref={scrollRef}
          onScroll={handleThreadScroll}
          onWheel={(event) => { if (event.deltaY < 0) followingLatestRef.current = false; }}
          onTouchStart={(event) => { touchYRef.current = event.touches.length === 1 ? event.touches[0].clientY : null; }}
          onTouchMove={(event) => {
            const y = event.touches.length === 1 ? event.touches[0].clientY : null;
            if (y !== null && touchYRef.current !== null && y > touchYRef.current) followingLatestRef.current = false;
            touchYRef.current = y;
          }}
          onTouchEnd={() => { touchYRef.current = null; }}
          onKeyDown={(event) => {
            if (event.defaultPrevented || (event.target as Element).closest("input,textarea,select,audio,video,[contenteditable=true],[role=menu]")) return;
            if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) followingLatestRef.current = false;
          }}
          onPointerDown={(event) => {
            // A scrollbar drag is another deliberate history-reading gesture.
            if (event.target !== event.currentTarget) return;
            const viewport = event.currentTarget;
            const gutter = viewport.offsetWidth - viewport.clientWidth;
            if (gutter <= 0) return;
            const bounds = viewport.getBoundingClientRect();
            if (event.clientX >= bounds.right - gutter || event.clientX <= bounds.left + gutter) followingLatestRef.current = false;
          }}
          onFocusCapture={(event) => {
            // Quote/pin navigation focuses the message row, not a child control.
            if (event.target.hasAttribute("data-message-id")) followingLatestRef.current = false;
          }}
          aria-hidden={conversationLoading}
          inert={conversationLoading}
          className={cn(
            // Padding grows with the card so messages keep a readable 64rem measure.
            "p-3 transition-opacity duration-150 md:py-5 md:pl-[max(1.25rem,calc((100%-64rem)/2))] md:pr-[max(1.25rem,calc((100%-64rem)/2))]",
            conversationLoading && "opacity-0"
          )}
        >
          <MessageScrollerContent
            ref={contentRef}
            className={cn("gap-0", fillAvailable && "max-lg:justify-end")}
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
              <Marker className="mx-auto my-auto w-full max-w-sm flex-col items-center justify-center px-5 py-8 text-center md:px-6 md:py-10">
                <MarkerIcon className="size-10 rounded-xl bg-primary/12 p-2 text-primary">
                  <Send className="size-5" />
                </MarkerIcon>
                <MarkerContent className="mt-3 space-y-1">
                  <span {...elementTiming("chat-messages")} className="block font-heading text-lg font-semibold text-foreground">
                    Start the thread
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {emptyDescription ?? resolvedEmptyDescription}
                  </span>
                </MarkerContent>
              </Marker>
            ) : (
              messageRows
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {!conversationLoading ? (
          <MessageScrollerButton direction="end" className="bottom-3" onClick={() => { followingLatestRef.current = true; }} />
        ) : null}
        {conversationLoading ? <ConversationLoadingState /> : null}
      </MessageScroller>
    </MessageScrollerProvider>
  ), [conversationLoading, handleThreadScroll, fillAvailable, contextLabel,
    resolvedContextLabel, visibleMessages.length, emptyDescription,
    resolvedEmptyDescription, messageRows]);

  return (
    <section
        aria-busy={conversationLoading}
        data-chat-thread
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          fileDragDepth.current += 1;
          if (!attachmentsDisabled) setDraggingFiles(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          // Prevent the browser from opening the file, including while busy.
          event.preventDefault();
          event.dataTransfer.dropEffect = attachmentsDisabled ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
          if (fileDragDepth.current === 0) setDraggingFiles(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          fileDragDepth.current = 0;
          setDraggingFiles(false);
          addPendingFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "conversation-transcript relative flex flex-col overflow-hidden bg-card text-card-foreground lg:surface-shadow lg:rounded-xl lg:border",
          heightClass
        )}
      >
        {draggingFiles && !attachmentsDisabled ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/95 p-4 text-center"
          >
            <Paperclip aria-hidden className="size-6 text-primary" />
            <p className="font-medium">Drop files to attach</p>
            <p className="text-sm text-muted-foreground">
              Review them before sending.
            </p>
          </div>
        ) : null}
        {transcript}

        {replyTarget && !editing ? (
          <div className="flex shrink-0 items-center gap-2 border-t bg-muted/40 px-3 py-2" data-reply-composer>
            <Reply aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-sm" role="status">
              <p className="truncate font-medium">Replying to {replyTarget.authorName ?? "Teammate"}</p>
              <p className="truncate text-xs text-muted-foreground">{replyTarget.preview}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Cancel reply" disabled={sending} onClick={() => setReplyTarget(null)}>
              <X className="size-4" />
            </Button>
          </div>
        ) : null}

        {!editing && (pendingFiles.length > 0 || voiceDraft) ? (
          <div className="shrink-0 space-y-2 border-t bg-background/55 px-3 py-2.5 sm:pl-[max(1rem,calc((100%-64rem)/2))] sm:pr-[max(1rem,calc((100%-64rem)/2))]">
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
                <DraftFileAttachment
                  key={`${f.name}-${i}`}
                  file={f}
                  sending={sending}
                  onRemove={() =>
                    setPendingFiles((p) => p.filter((_, j) => j !== i))
                  }
                />
              ))}
              </AttachmentGroup>
            ) : null}
            {pendingFiles.some(isChatVideo) ? <ChatVideoQualityControl quality={videoQuality} disabled={sending}
              onChange={quality => { setVideoQuality(quality); setSendError(null); }} /> : null}
            {fileProgress ? <ChatFileProgress value={fileProgress} onCancel={() => sendController.current?.abort()} />
              : sending && pendingFiles.length > 0 ? (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 aria-hidden className="size-3 animate-spin" />
                Sending attachments…
              </p>
            ) : null}
            {voiceDraft ? (
              <p className="px-1 text-xs text-muted-foreground">
                Add a short note or transcript below so the message can be read
                without audio.
              </p>
            ) : null}
          </div>
        ) : null}

        {!editing && sendError ? (
          <p role="alert" className="shrink-0 border-t px-3 py-2 text-sm text-destructive">
            {sendError} Your draft is restored.
          </p>
        ) : null}
        {channelMentions && !editing && hasChannelMention(input, members) ? (
          <p role="status" className="shrink-0 border-t bg-primary/5 px-3 py-2 text-xs text-foreground lg:px-4">
            <strong>@channel</strong> notifies everyone in this channel. Use it for important updates.
          </p>
        ) : null}
        {editing ? <MessageEditor draft={editing} members={members}
          onChange={text => setEditing(current => current ? { ...current, text, error: undefined } : current)}
          onCancel={cancelEdit} onSave={saveEdit} /> : <div
          data-chat-composer
          className="conversation-composer flex shrink-0 items-end gap-1 border-t bg-background px-2 pt-2 lg:gap-2 lg:py-3 lg:pl-[max(0.75rem,calc((100%-64rem)/2))] lg:pr-[max(0.75rem,calc((100%-64rem)/2))]"
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            disabled={attachmentsDisabled}
            onChange={(e) => {
              addPendingFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-11 lg:size-10"
            aria-label="Attach files"
            disabled={attachmentsDisabled}
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
                autoFocus={restoreComposerFocus}
                value={input}
                onChange={(value) => {
                  setInput(value);
                  setSendError(null);
                }}
                members={members}
                channelMentions={channelMentions}
                onPaste={(event) => {
                  if (attachmentsDisabled) return;
                  const images = clipboardImageFiles(event.clipboardData);
                  if (images.length === 0) return;
                  event.preventDefault();
                  addPendingFiles(images);
                }}
                onKeyDown={(e) => {
                  sendOnConversationKey(e, () => void send());
                }}
                placeholder={
                  voiceDraft
                    ? "Add a note (optional)..."
                    : placeholder ?? resolvedPlaceholder
                }
                disabled={conversationLoading}
                rows={1}
                containerClassName="min-w-0 flex-1"
                className="max-h-32 min-h-11 w-full resize-none rounded-xl bg-card px-3 py-2.5 text-base shadow-none lg:text-sm"
              />
              <Button
                size="icon"
                className="conversation-send size-11 lg:size-10"
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
        </div>}
    </section>
  );
}

function DraftFileAttachment({
  file,
  sending,
  onRemove,
}: {
  file: File;
  sending: boolean;
  onRemove: () => void;
}) {
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    if (!image) return;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <Attachment
      state={sending ? "uploading" : "idle"}
      size="xs"
      className={cn(file.type.startsWith("image/") && "w-52")}
    >
      {file.type.startsWith("image/") ? (
        <div className="w-full overflow-hidden rounded-md bg-muted/40">
          {/* Object URLs stay local until Send and are released on removal. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            alt={file.name}
            className="h-24 w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        </div>
      ) : (
        <AttachmentMedia className="bg-primary/10 text-primary">
          {isChatVideo(file) ? <Video className="size-3.5" /> : <Paperclip className="size-3.5" />}
        </AttachmentMedia>
      )}
      <AttachmentContent className="min-w-0 max-w-64">
        <AttachmentTitle>{file.name}</AttachmentTitle>
        <AttachmentDescription>{formatBytes(file.size)}</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction
          type="button"
          className="size-10"
          aria-label={`Remove ${file.name}`}
          disabled={sending}
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

function ConversationLoadingState() {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-card/82 backdrop-blur-[1px] low-power:backdrop-filter-none"
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
  pin,
  pinPending,
  onReact,
  onDelete,
  onTogglePin,
  onReply,
  onShowOriginal,
  replyDisabled,
  showAuthor,
  showTime,
  direct,
  channelMentions,
  timeZone,
  reactionPending,
  frequentEmojis,
  onEdit,
  editDisabled,
  editPending,
  timingId,
}: {
  m: ChatMessageView;
  /** Element Timing name for useful-work measurement (see use-useful-work). */
  timingId?: string;
  isOwn: boolean;
  members: MentionTarget[];
  currentUserId: string;
  pin: ChatPinnedMessage | undefined;
  pinPending: boolean;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onReply: () => void;
  onShowOriginal: (messageId: string) => void;
  replyDisabled: boolean;
  showAuthor: boolean;
  showTime: boolean;
  direct: boolean;
  channelMentions: boolean;
  timeZone?: string;
  reactionPending: boolean;
  frequentEmojis: string[];
  onEdit: () => void;
  editDisabled: boolean;
  editPending: boolean;
}) {
  const previewUrl = m.content ? firstMessageLink(m.content) : null;
  const hasImages = m.attachments.some((attachment) => attachment.mimeType.startsWith("image/"));
  const otherAttachments = m.attachments.filter((attachment) => !attachment.mimeType.startsWith("image/"));
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
      className={cn("items-start", isOwn ? "pl-12" : direct ? "pr-12" : "pl-10 pr-12")}
    >
      <MessageContent className="w-fit max-w-[min(42rem,100%)] gap-1">
        <span className="sr-only">{m.authorName ?? "Teammate"}, {new Date(m.createdAt).toLocaleString("en", { timeZone })}</span>
        {(!isOwn && showAuthor) || m.status !== "sent" || pin || editPending ? <MessageHeader className={cn("flex-wrap gap-2 px-1", isOwn && "justify-end")}>
          {!isOwn && showAuthor ? <span className="truncate font-semibold text-foreground">{m.authorName ?? "Teammate"}</span> : null}
          {m.status === "uploading" ? <span role="status" className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />{m.attachments.length > 0 ? "Uploading…" : "Sending…"}</span> : m.status === "failed" ? <span role="status" className="text-destructive">Attachment failed</span> : null}
          {pin ? <span className="inline-flex min-w-0 items-center gap-1 text-primary"><Pin aria-hidden className="size-3 shrink-0" /><span className="truncate">{pinnedByLabel(pin, currentUserId)}</span></span> : null}
          {editPending ? <span role="status" className="inline-flex items-center gap-1"><Loader2 aria-hidden className="size-3 animate-spin" />Saving edit…</span> : null}
        </MessageHeader> : null}

        <MessageActions m={m} isOwn={isOwn} pin={!!pin} time={timeLabel(m.createdAt, timeZone)} frequentEmojis={frequentEmojis}
          onEdit={onEdit} editDisabled={editDisabled} editPending={editPending}
          onReply={onReply} replyDisabled={replyDisabled}
          reactionPending={reactionPending} pinPending={pinPending}
          onReact={onReact} onTogglePin={onTogglePin} onDelete={onDelete}>
          {!isOwn && !direct && showAuthor ? <MessageAvatar aria-hidden="true" className="absolute right-full bottom-0 mr-2 size-8 min-w-8 rounded-full bg-muted text-xs font-semibold">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-full object-cover" />
            ) : initials}
          </MessageAvatar> : null}
          {m.content || m.replyTo || hasImages ? (
            <Bubble
              variant={isOwn ? "default" : "secondary"}
              align={isOwn ? "end" : "start"}
              className="max-w-full"
            >
              <BubbleContent
                className={cn(
                  "min-h-11 whitespace-pre-wrap py-2.5 text-[15px] leading-relaxed lg:text-sm",
                  hasImages && "w-min p-1 whitespace-normal",
                  isOwn
                    ? "conversation-own-bubble bg-primary text-primary-foreground"
                    : "conversation-incoming-bubble text-foreground"
                )}
              >
                {hasImages ? <ChatImageGallery attachments={m.attachments} /> : null}
                {m.content || m.replyTo ? (
                  <div {...(timingId ? elementTiming(timingId) : undefined)} className={hasImages ? "px-2 py-1.5 whitespace-pre-wrap" : undefined}>
                    {m.replyTo ? (
                      <button
                        type="button"
                        disabled={m.replyTo.unavailable}
                        onClick={() => onShowOriginal(m.replyTo!.messageId)}
                        aria-label={m.replyTo.unavailable ? "Original message unavailable" : `View original message from ${m.replyTo.authorName ?? "Teammate"}`}
                        className={cn("flex min-h-11 w-full min-w-0 items-start gap-2 rounded-md px-2.5 py-2 text-left whitespace-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:cursor-default motion-reduce:transition-none", m.content && "mb-2", isOwn ? "bg-black/15 hover:bg-black/20" : "bg-muted hover:bg-muted/80")}
                      >
                        <Reply aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          {!m.replyTo.unavailable ? <span className="block truncate text-xs font-semibold">{m.replyTo.authorName ?? "Teammate"}</span> : null}
                          <span className="line-clamp-2 text-xs leading-relaxed [overflow-wrap:anywhere]">{m.replyTo.preview}</span>
                        </span>
                      </button>
                    ) : null}
                    {m.content ? <MessageText
                      text={m.content}
                      members={members}
                      currentUserId={currentUserId}
                      tone={isOwn ? "onPrimary" : "default"}
                      className="conversation-mention"
                      channelMentions={channelMentions}
                    /> : null}
                    {previewUrl && m.status === "sent" && !editPending ? <MessageLinkPreview key={`${m.id}:${previewUrl}`} messageId={m.id} url={previewUrl} isOwn={isOwn} /> : null}
                  </div>
                ) : null}
              </BubbleContent>

            </Bubble>
          ) : null}

          {otherAttachments.length > 0 ? (
            <AttachmentGroup
              className={cn(
                "max-w-full flex-wrap gap-2 overflow-visible py-0",
                isOwn ? "justify-end" : "justify-start"
              )}
            >
              {otherAttachments.map((a) => (
                a.mimeType.startsWith("audio/") && a.label === "voice" ? (
                  <VoiceMessagePlayer
                    key={a.attachmentId}
                    id={a.attachmentId}
                    src={`/api/files/${a.fileId}/download?inline=1`}
                    isOwn={isOwn}
                    metadata={a.audioMetadata}
                  />
                ) : a.mimeType.startsWith("video/") ? (
                  <ChatVideoPlayer key={a.attachmentId} fileId={a.fileId} name={a.originalName} sizeBytes={a.sizeBytes} />
                ) : (
                <Attachment
                  key={a.attachmentId}
                  size="sm"
                  state={m.status === "uploading" ? "uploading" : "done"}
                  className="max-w-full bg-background/80 lg:max-w-[18rem]"
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
                      render={<FileLink href={`/api/files/${a.fileId}/download`} />}
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

        </MessageActions>

        <MessageReactions reactions={m.reactions} isOwn={isOwn} pending={reactionPending} onReact={onReact} />
        {showTime || m.editedAt || (isOwn && m.status === "sent") ? <div className={cn("flex flex-wrap items-center gap-1.5 px-1 text-[11px] tabular-nums text-muted-foreground", isOwn && "self-end justify-end")}>
          {showTime || m.editedAt ? <time dateTime={m.createdAt}>{timeLabel(m.createdAt, timeZone)}</time> : null}
          {m.editedAt ? <span title={`Edited ${new Date(m.editedAt).toLocaleString("en", { timeZone })}`}>Edited</span> : null}
          <MessageReceipt message={m} direct={direct} />
        </div> : null}

      </MessageContent>

    </Message>
  );
}
