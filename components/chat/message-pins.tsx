"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileText, Mic, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";

import type { ChatMessageView } from "@/lib/chat/queries";
import { pinMessage, unpinMessage } from "@/lib/chat/pin-actions";
import {
  PINNED_LIST_LIMIT,
  applyPinChange,
  pinExcerpt,
  pinnedByLabel,
  pinnedMessagePreview,
  sortPins,
  summarizePinnedAttachments,
  type ChatPinnedMessage,
  type PinChange,
} from "@/lib/chat/pin-state";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { usePropState } from "@/hooks/use-prop-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

const PIN_ERROR = "Couldn't pin the message. Check your internet and try again.";
const UNPIN_ERROR =
  "Couldn't unpin the message. Check your internet and try again.";
const HIGHLIGHT_MS = 1800;

type MessagePinsValue = {
  currentUserId: string;
  /** Visible pins (server data plus optimistic changes), newest pin first. */
  pins: ChatPinnedMessage[];
  pinFor: (messageId: string) => ChatPinnedMessage | undefined;
  isPending: (messageId: string) => boolean;
  pin: (message: ChatMessageView) => void;
  unpin: (messageId: string) => void;
  /**
   * Call before fetching the recent window. The returned function accepts the
   * fetched pins, and ignores them if a local change started or finished in
   * the meantime (a stale poll must not undo a pin the reader just made).
   */
  beginPinsFetch: () => (pins: ChatPinnedMessage[]) => void;
  /** Remove a deleted message's pin now; restore it if the delete fails. */
  forgetMessage: (messageId: string, request: Promise<unknown>) => void;
};

const MessagePinsContext = createContext<MessagePinsValue | null>(null);

export function useMessagePins() {
  const value = useContext(MessagePinsContext);
  if (!value) {
    throw new Error("useMessagePins must be used inside MessagePinsProvider.");
  }
  return value;
}

function pinKey(change: PinChange) {
  return change.type === "pin" ? change.pin.messageId : change.messageId;
}

function failure(message: string) {
  return { ok: false as const, error: { message } };
}

/**
 * Shared pin state for one conversation, so the header's Pinned list and the
 * message thread always agree. Keyed by channel at the call site.
 */
export function MessagePinsProvider({
  currentUserId,
  currentUserName,
  initialPins,
  children,
}: {
  currentUserId: string;
  currentUserName: string;
  initialPins: ChatPinnedMessage[];
  children: React.ReactNode;
}) {
  const [serverPins, setServerPins] = usePropState(initialPins);
  const pins = useOptimisticAction<ChatPinnedMessage[], PinChange>({
    state: serverPins,
    update: applyPinChange,
    getKey: pinKey,
  });
  const { run, isPending } = pins;
  const inFlight = useRef(0);
  const lastSettledAt = useRef(0);

  const beginLocalChange = useCallback(() => {
    inFlight.current += 1;
    let settled = false;
    return () => {
      if (settled) return;
      settled = true;
      inFlight.current -= 1;
      lastSettledAt.current = performance.now();
    };
  }, []);

  const beginPinsFetch = useCallback(() => {
    const startedAt = performance.now();
    return (next: ChatPinnedMessage[]) => {
      if (inFlight.current > 0 || startedAt < lastSettledAt.current) return;
      setServerPins(next);
    };
  }, [setServerPins]);

  const pinsById = useMemo(
    () => new Map(pins.state.map((item) => [item.messageId, item])),
    [pins.state]
  );
  const pinFor = useCallback(
    (messageId: string) => pinsById.get(messageId),
    [pinsById]
  );

  const pin = useCallback(
    (message: ChatMessageView) => {
      if (message.id.startsWith("pending-") || isPending(message.id)) return;
      const optimistic: ChatPinnedMessage = {
        messageId: message.id,
        authorId: message.userId,
        authorName: message.authorName,
        authorImage: message.authorImage,
        excerpt: pinExcerpt(message.content),
        attachments: summarizePinnedAttachments(message.attachments),
        sentAt: message.createdAt,
        pinnedAt: new Date().toISOString(),
        pinnedById: currentUserId,
        pinnedByName: currentUserName,
        inRecentWindow: true,
      };
      const done = beginLocalChange();
      run(
        { type: "pin", pin: optimistic },
        () => pinMessage(message.id).catch(() => failure(PIN_ERROR)),
        {
          errorMessage: PIN_ERROR,
          // The server keeps the first pin, so trust its who/when.
          reconcile: (result, current) => {
            const saved = result.ok ? result.data : undefined;
            return saved
              ? current.map((item) =>
                  item.messageId === saved.messageId ? saved : item
                )
              : current;
          },
          onSuccess: done,
          onError: done,
        }
      );
    },
    [beginLocalChange, currentUserId, currentUserName, isPending, run]
  );

  const unpin = useCallback(
    (messageId: string) => {
      if (isPending(messageId)) return;
      const done = beginLocalChange();
      run(
        { type: "unpin", messageId },
        () => unpinMessage(messageId).catch(() => failure(UNPIN_ERROR)),
        { errorMessage: UNPIN_ERROR, onSuccess: done, onError: done }
      );
    },
    [beginLocalChange, isPending, run]
  );

  const forgetMessage = useCallback(
    (messageId: string, request: Promise<unknown>) => {
      if (!pinsById.has(messageId)) return;
      const done = beginLocalChange();
      let snapshot: ChatPinnedMessage | undefined;
      setServerPins((current) => {
        snapshot = current.find((item) => item.messageId === messageId);
        return snapshot
          ? current.filter((item) => item.messageId !== messageId)
          : current;
      });
      request.then(done, () => {
        done();
        const restored = snapshot;
        if (!restored) return;
        setServerPins((current) =>
          current.some((item) => item.messageId === messageId)
            ? current
            : sortPins([...current, restored])
        );
      });
    },
    [beginLocalChange, pinsById, setServerPins]
  );

  const value = useMemo<MessagePinsValue>(
    () => ({
      currentUserId,
      pins: pins.state,
      pinFor,
      isPending,
      pin,
      unpin,
      beginPinsFetch,
      forgetMessage,
    }),
    [
      beginPinsFetch,
      currentUserId,
      forgetMessage,
      isPending,
      pin,
      pinFor,
      pins.state,
      unpin,
    ]
  );

  return (
    <MessagePinsContext.Provider value={value}>
      {children}
    </MessagePinsContext.Provider>
  );
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Scroll the thread to a loaded message and briefly highlight it. */
function showMessageInChat(messageId: string) {
  const element = document.querySelector<HTMLElement>(
    `[data-chat-thread] [data-message-id="${CSS.escape(messageId)}"]`
  );
  if (!element) {
    toast.info("This message is not in the recent messages.");
    return;
  }
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  element.scrollIntoView({
    block: "center",
    behavior: reduceMotion ? "auto" : "smooth",
  });
  element.dataset.pinHighlight = "true";
  window.setTimeout(() => {
    delete element.dataset.pinHighlight;
  }, HIGHLIGHT_MS);
}

/** Header button with the conversation's pin count; opens the Pinned list. */
export function PinnedMessagesButton({ className }: { className?: string }) {
  const { pins, unpin, isPending, currentUserId } = useMessagePins();
  const [open, setOpen] = useState(false);
  const count = pins.length;
  // The list holds the newest pins only, so a full list may have more behind it.
  const countLabel = count >= PINNED_LIST_LIMIT ? `${PINNED_LIST_LIMIT}+` : String(count);

  function showInChat(messageId: string) {
    setOpen(false);
    // Let the sheet start closing so focus returns before the thread scrolls.
    window.requestAnimationFrame(() => showMessageInChat(messageId));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={
              count > 0
                ? `Show pinned messages (${countLabel})`
                : "Show pinned messages"
            }
            className={cn("h-10 lg:h-9", className)}
          />
        }
      >
        <Pin className="size-4" />
        <span className="max-sm:sr-only">Pinned</span>
        {count > 0 ? (
          <span className="min-w-5 rounded-full bg-primary/12 px-1.5 text-center text-xs font-semibold tabular-nums text-primary">
            {countLabel}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent className="data-[side=right]:w-[calc(100%-1rem)] data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Pinned messages</SheetTitle>
          <SheetDescription>
            Important messages everyone in this conversation can find again.
            The newest pin is first.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {count === 0 ? (
            <div className="mt-2 rounded-lg border border-dashed px-4 py-8 text-center">
              <Pin className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No pinned messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the pin button on a message to keep it here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pins.map((item) => (
                <PinnedMessageItem
                  key={item.messageId}
                  pin={item}
                  currentUserId={currentUserId}
                  pending={isPending(item.messageId)}
                  onShow={() => showInChat(item.messageId)}
                  onUnpin={() => unpin(item.messageId)}
                />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PinnedMessageItem({
  pin,
  currentUserId,
  pending,
  onShow,
  onUnpin,
}: {
  pin: ChatPinnedMessage;
  currentUserId: string;
  pending: boolean;
  onShow: () => void;
  onUnpin: () => void;
}) {
  const author = pin.authorName ?? "Unknown";
  const hasVoice = !pin.excerpt && pin.attachments.some((a) => a.kind === "voice");
  const hasFiles = !pin.excerpt && !hasVoice && pin.attachments.length > 0;
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <UserAvatar
          name={author}
          image={pin.authorImage}
          size="sm"
          className="shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {author}
        </span>
        <time
          dateTime={pin.sentAt}
          className="shrink-0 text-xs tabular-nums text-muted-foreground"
        >
          {formatWhen(pin.sentAt)}
        </time>
      </span>
      <span className="mt-2 flex items-start gap-1.5 text-sm text-foreground/90">
        {hasVoice ? (
          <Mic className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : hasFiles ? (
          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
        <span className="line-clamp-3 min-w-0 break-words">
          {pinnedMessagePreview(pin)}
        </span>
      </span>
      <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Pin aria-hidden className="size-3 shrink-0" />
        <span className="min-w-0">
          {pinnedByLabel(pin, currentUserId)} · {formatWhen(pin.pinnedAt)}
        </span>
      </span>
      {pin.inRecentWindow ? null : (
        <span className="mt-1 block text-xs text-muted-foreground">
          Older message. It is not in the recent messages.
        </span>
      )}
    </>
  );

  return (
    <li
      className="optimistic-item-in rounded-lg border bg-background/60"
      aria-busy={pending}
    >
      {pin.inRecentWindow ? (
        <button
          type="button"
          onClick={onShow}
          className="block w-full rounded-t-lg px-3 pt-3 pb-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {body}
        </button>
      ) : (
        <div className="px-3 pt-3 pb-2">{body}</div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t px-2 py-1.5">
        {pin.inRecentWindow ? (
          <Button type="button" variant="ghost" size="sm" onClick={onShow}>
            Show in chat
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onUnpin}
        >
          <PinOff />
          Unpin message
        </Button>
      </div>
    </li>
  );
}
