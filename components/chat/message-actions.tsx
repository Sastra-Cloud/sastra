"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Copy, MoreHorizontal, Pencil, Pin, PinOff, Plus, Reply, SmilePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu } from "@base-ui/react/menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { MESSAGE_NATIVE_CONTROLS, useMessageHold } from "./use-message-hold";
import { useMessageMenuLayout } from "./use-message-menu-layout";
import { messageHoldHaptic } from "@/lib/chat/haptics";
import { DEFAULT_REACTIONS } from "@/lib/chat/reaction-suggestions";
import { cn } from "@/lib/utils";
import ReactionPicker from "./reaction-picker";
import type { ChatMessageView } from "@/lib/chat/queries";

export function MessageActions({ m, isOwn, pin, time, reactionPending, pinPending, onReact, onTogglePin, onDelete, children, frequentEmojis = DEFAULT_REACTIONS, onEdit, editDisabled = false, editPending = false, onReply, replyDisabled = false }: {
  m: ChatMessageView; isOwn: boolean; pin: boolean; time: string;
  reactionPending: boolean; pinPending: boolean;
  onReact: (emoji: string) => void; onTogglePin: () => void; onDelete: () => void;
  children: ReactNode;
  frequentEmojis?: string[];
  onEdit?: () => void; editDisabled?: boolean; editPending?: boolean;
  onReply?: () => void; replyDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [reactionsOnly, setReactionsOnly] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editHandoff, setEditHandoff] = useState(false);
  const copyingRef = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const reactionTrigger = useRef<HTMLButtonElement>(null);
  const keyboardOpen = useRef(false);
  const pickerClose = useRef<HTMLButtonElement>(null);
  const reactionBar = useRef<HTMLDivElement>(null);
  const commands = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<HTMLDivElement | null>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  const layout = useMessageMenuLayout(open, reactionsOnly, surface, menu, reactionBar, commands, closeMenu);
  useLayoutEffect(() => {
    if (!open || !menu || !keyboardOpen.current) return;
    menu.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])')?.focus({ preventScroll: true });
    keyboardOpen.current = false;
  }, [open, menu]);
  const [sheet, setSheet] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!picker || !sheet) return;
    // The sheet is portaled after the menu's closing focus handoff.
    pickerClose.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const update = () => {
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      const height = viewport?.height ?? window.innerHeight;
      const inset = Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0));
      sheet.style.setProperty("bottom", `${inset + (window.matchMedia("(min-width: 640px)").matches ? 24 : 0)}px`);
      sheet.style.setProperty("--reaction-viewport-height", `${height}px`);
      sheet.toggleAttribute("data-compact-reactions", height < 340);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [picker, sheet]);
  const available = !m.id.startsWith("pending-");
  const hold = useMessageHold(available && !reactionPending && !open && !picker, () => {
    setEditHandoff(false);
    setReactionsOnly(false);
    setOpen(true);
    void messageHoldHaptic();
  });
  const selected = (emoji: string) => m.reactions.some(item => item.emoji === emoji && item.mine);
  function react(emoji: string) {
    if (reactionPending) return;
    onReact(emoji);
    setOpen(false);
    setPicker(false);
  }
  async function copyMessageText() {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(m.content ?? "");
      toast.success("Message copied");
      setOpen(false);
    } catch { toast.error("Could not copy the message. Please try again."); }
    finally { copyingRef.current = false; setCopying(false); }
  }
  function openMenu(keyboard = false) {
    if (!available || picker) return;
    keyboardOpen.current = keyboard;
    setEditHandoff(false);
    setReactionsOnly(false);
    setOpen(true);
  }
  function replyToMessage() {
    if (!available || replyDisabled || !onReply) return;
    setEditHandoff(true);
    setOpen(false);
    onReply();
    // Keep this in the gesture so touch keyboards can open as well.
    surface.current?.closest("[data-chat-thread]")?.querySelector<HTMLTextAreaElement>("[data-chat-composer] textarea")?.focus({ preventScroll: true });
  }
  const itemClass = "flex min-h-11 w-full cursor-default items-center gap-2 rounded-xl px-3 text-sm outline-none data-highlighted:bg-muted data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";
  return <>
    <TooltipProvider delay={450}>
    <Menu.Root open={open} modal={false} triggerId={`${reactionsOnly ? "message-reactions" : "message-actions"}-${m.id}`} onOpenChange={(next, details) => {
      if (next) {
        setEditHandoff(false);
        setReactionsOnly(!!(details && details.event.target instanceof Element && details.event.target.closest("[data-message-react-trigger]")));
      }
      setOpen(next);
    }}>
      <div ref={surface} {...hold} data-message-press-surface="" data-message-selected={open || picker || undefined}
        onContextMenu={event => {
          hold.onContextMenu(event);
          if (event.defaultPrevented || !available || (event.target as Element).closest(MESSAGE_NATIVE_CONTROLS)) return;
          // Keep the browser's Copy / Open link controls for selected text and links.
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed && selection.containsNode(event.target as Node, true)) return;
          event.preventDefault();
          event.stopPropagation();
          openMenu();
        }}
        onKeyDown={event => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          if (!available || (event.target as Element).closest(MESSAGE_NATIVE_CONTROLS) && !(event.target as Element).closest("[data-message-tools]")) return;
          event.preventDefault();
          event.stopPropagation();
          openMenu(true);
        }}
        className={cn("relative flex min-h-11 w-fit max-w-full flex-col gap-2 rounded-xl", isOwn && "self-end")}>
        {children}
        <div data-message-tools="" className={cn("conversation-message-tools absolute top-1/2 flex -translate-y-1/2 items-center", isOwn ? "right-full flex-row-reverse pr-2" : "left-full pl-2")}>
          <Tooltip>
            <Menu.Trigger id={`message-reactions-${m.id}`} data-message-react-trigger=""
              render={<TooltipTrigger render={<Button ref={reactionTrigger} type="button" variant="ghost" size="icon" />} />} aria-label="React to message"
              disabled={!available || reactionPending} className="conversation-message-quick size-8 rounded-full text-muted-foreground">
              <SmilePlus className="size-4" />
            </Menu.Trigger>
            <TooltipContent className="motion-reduce:animate-none">React</TooltipContent>
          </Tooltip>
          {onReply ? <Tooltip>
            <TooltipTrigger render={<Button type="button" variant="ghost" size="icon" />} aria-label="Reply to message"
              disabled={!available || replyDisabled} onClick={replyToMessage} className="conversation-message-quick size-8 rounded-full text-muted-foreground">
              <Reply className="size-4" />
            </TooltipTrigger>
            <TooltipContent className="motion-reduce:animate-none">Reply</TooltipContent>
          </Tooltip> : null}
          <Tooltip>
            <Menu.Trigger id={`message-actions-${m.id}`} render={<TooltipTrigger render={<Button ref={trigger} type="button" variant="ghost" size="icon" />} />} disabled={!available}
              aria-label={`Message actions: ${m.content?.slice(0, 60) || "Attachment"}, ${m.authorName ?? "Teammate"}, ${time}`}
              className="conversation-message-more size-11 rounded-full text-muted-foreground">
              <MoreHorizontal className="size-4" />
            </Menu.Trigger>
            <TooltipContent className="motion-reduce:animate-none">More actions</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Menu.Portal>
        <Menu.Positioner anchor={surface} positionMethod="fixed" side={layout.split ? "bottom" : "top"} align={isOwn ? "end" : "start"}
          sideOffset={layout.split ? ({ anchor }) => -anchor.height - layout.reactionHeight - 8 : 8}
          sticky collisionBoundary={layout.boundary} collisionPadding={12} collisionAvoidance={{ side: "shift", align: "shift" }} className="isolate z-50">
          <Menu.Popup ref={setMenu} finalFocus={picker || editHandoff ? false : reactionsOnly ? reactionTrigger : trigger} aria-label="Message actions"
            data-layout={layout.split ? "split" : "compact"}
            style={{ gap: layout.gap, maxHeight: layout.height || "calc(100dvh - 24px)" }}
            className="conversation-message-menu flex w-72 max-w-[calc(100vw-1.5rem)] flex-col rounded-2xl text-popover-foreground outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none">
            <Menu.Group ref={reactionBar} aria-label="Reactions" className="conversation-message-reactions grid shrink-0 grid-cols-6 p-2"
              onKeyDown={event => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([data-disabled])'));
                const index = items.indexOf(document.activeElement as HTMLElement);
                if (index < 0) return;
                event.preventDefault();
                event.stopPropagation();
                items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]?.focus();
              }}>
              {frequentEmojis.slice(0, 5).map(emoji => <Menu.CheckboxItem key={emoji} disabled={reactionPending} onClick={() => react(emoji)}
                aria-label={`React ${emoji}`} checked={selected(emoji)} closeOnClick={false}
                className="flex size-11 cursor-default items-center justify-center rounded-xl text-2xl outline-none data-highlighted:bg-muted data-checked:bg-primary/15 data-checked:ring-1 data-checked:ring-primary/50 data-disabled:opacity-50">{emoji}</Menu.CheckboxItem>)}
              <Menu.Item className="flex size-11 cursor-default items-center justify-center rounded-xl outline-none data-highlighted:bg-muted data-disabled:opacity-50" aria-label="More reactions"
                disabled={reactionPending} closeOnClick={false} onClick={() => { setOpen(false); setPicker(true); }}><Plus className="size-5" /></Menu.Item>
            </Menu.Group>
            {!reactionsOnly ? <Menu.Group ref={commands} aria-label="Actions" className="conversation-message-commands min-h-0 overflow-y-auto overscroll-contain p-2">
              <p className="truncate px-3 py-2 text-xs text-muted-foreground">{m.authorName ?? "Teammate"} · {time}</p>
              {available && onReply ? <Menu.Item className={itemClass} disabled={replyDisabled} closeOnClick={false} onClick={replyToMessage}><Reply />Reply</Menu.Item> : null}
              {isOwn && available && m.content && m.status === "sent" && onEdit ? <Menu.Item className={itemClass} disabled={editDisabled} closeOnClick={false}
                onClick={() => { setEditHandoff(true); setOpen(false); onEdit(); }}><Pencil />Edit message</Menu.Item> : null}
              {m.content ? <Menu.Item className={itemClass} disabled={copying} closeOnClick={false} onClick={copyMessageText}><Copy />{copying ? "Copying…" : "Copy text"}</Menu.Item> : null}
              <Menu.Item className={itemClass} disabled={pinPending} closeOnClick={false}
                onClick={() => { onTogglePin(); setOpen(false); }}>{pin ? <PinOff /> : <Pin />}{pin ? "Unpin message" : "Pin message"}</Menu.Item>
              {isOwn ? <><Menu.Separator className="mx-2 my-1 h-px bg-border" /><Menu.Item className={cn(itemClass, "text-destructive data-highlighted:bg-destructive/10")}
                disabled={editPending} closeOnClick={false} onClick={() => { setOpen(false); onDelete(); }}><Trash2 />Delete message</Menu.Item></> : null}
            </Menu.Group> : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
    </TooltipProvider>
    <Sheet open={picker} onOpenChange={setPicker}>
      {picker ? <SheetContent ref={setSheet} side="bottom" showCloseButton={false} finalFocus={reactionsOnly ? reactionTrigger : trigger} initialFocus={pickerClose}
        className="conversation-reaction-sheet mx-auto max-h-[min(42rem,90dvh)] max-w-md gap-0 rounded-t-2xl px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] motion-reduce:transition-none sm:bottom-6 sm:rounded-2xl sm:border">
        <div className="flex min-w-0 items-center gap-3 px-1 pb-2">
          <div className="min-w-0 flex-1"><SheetTitle>React to message</SheetTitle><SheetDescription className="truncate">{m.content || "Attachment"}</SheetDescription></div>
          <Button ref={pickerClose} type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close reactions" onClick={() => setPicker(false)}><X className="size-5" /></Button>
        </div>
        <ReactionPicker onSelect={react} frequentEmojis={frequentEmojis} selectedEmojis={m.reactions.filter(item => item.mine).map(item => item.emoji)} />
      </SheetContent> : null}
    </Sheet>
  </>;
}
