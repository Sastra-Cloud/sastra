"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Copy, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMessageHold } from "./use-message-hold";
import { messageHoldHaptic } from "@/lib/chat/haptics";
import { DEFAULT_REACTIONS } from "@/lib/chat/reaction-suggestions";
import { cn } from "@/lib/utils";
import ReactionPicker from "./reaction-picker";
import type { ChatMessageView } from "@/lib/chat/queries";

export function MessageActions({ m, isOwn, pin, time, reactionPending, pinPending, onReact, onTogglePin, onDelete, children, frequentEmojis = DEFAULT_REACTIONS, onEdit, editDisabled = false, editPending = false }: {
  m: ChatMessageView; isOwn: boolean; pin: boolean; time: string;
  reactionPending: boolean; pinPending: boolean;
  onReact: (emoji: string) => void; onTogglePin: () => void; onDelete: () => void;
  children: ReactNode;
  frequentEmojis?: string[];
  onEdit?: () => void; editDisabled?: boolean; editPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editHandoff, setEditHandoff] = useState(false);
  const copyingRef = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pickerClose = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
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
  return <>
    <Popover open={open} onOpenChange={next => { if (next) setEditHandoff(false); setOpen(next); }}>
      <div ref={surface} {...hold} data-message-press-surface="" data-message-selected={open || picker || undefined}
        className={cn("relative flex min-h-11 w-fit max-w-full flex-col gap-2 rounded-xl", isOwn && "self-end")}>
        {children}
        <PopoverTrigger render={<Button ref={trigger} type="button" variant="ghost" size="icon" disabled={!available}
          aria-label={`Message actions: ${m.content?.slice(0, 60) || "Attachment"}, ${m.authorName ?? "Teammate"}, ${time}`}
          className={cn("absolute top-1/2 size-11 -translate-y-1/2 text-muted-foreground", isOwn ? "right-full mr-1" : "left-full ml-1")} />}>
          <MoreHorizontal className="size-4" />
        </PopoverTrigger>
      </div>
      <PopoverContent anchor={surface} side="top" align={isOwn ? "end" : "start"} sideOffset={8}
        ref={menu} initialFocus={menu} finalFocus={picker || editHandoff ? false : trigger} aria-label="Message actions"
        className="conversation-message-menu w-72 max-w-[calc(100vw-1rem)] gap-1 rounded-2xl p-2 motion-reduce:animate-none">
        <p className="truncate px-2 pb-1 text-xs text-muted-foreground">{m.authorName ?? "Teammate"} · {time}</p>
        <div className="grid grid-cols-6" aria-label="Add reaction">
          {frequentEmojis.slice(0, 5).map(emoji => <button key={emoji} type="button" disabled={reactionPending} onClick={() => react(emoji)}
            aria-label={`React ${emoji}`} aria-pressed={selected(emoji)}
            className="flex size-11 items-center justify-center rounded-xl text-2xl hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:bg-muted aria-pressed:bg-primary/15 aria-pressed:ring-1 aria-pressed:ring-primary/50 disabled:opacity-50">{emoji}</button>)}
          <Button type="button" size="icon" variant="ghost" className="size-11 rounded-xl" aria-label="More reactions"
            disabled={reactionPending} onClick={() => { setOpen(false); setPicker(true); }}><Plus className="size-5" /></Button>
        </div>
        {isOwn && available && m.content && m.status === "sent" && onEdit ? <Button type="button" variant="ghost" className="min-h-11 w-full justify-start rounded-xl" disabled={editDisabled}
          onClick={() => { setEditHandoff(true); setOpen(false); onEdit(); }}><Pencil className="size-4" />Edit message</Button> : null}
        {m.content ? <Button type="button" variant="ghost" className="min-h-11 w-full justify-start rounded-xl" disabled={copying} onClick={copyMessageText}><Copy className="size-4" />{copying ? "Copying…" : "Copy text"}</Button> : null}
        <Button type="button" variant="ghost" className="min-h-11 w-full justify-start rounded-xl" disabled={pinPending}
          onClick={() => { onTogglePin(); setOpen(false); }}>{pin ? <PinOff className="size-4" /> : <Pin className="size-4" />}{pin ? "Unpin message" : "Pin message"}</Button>
        {isOwn ? <Button type="button" variant="ghost" className="min-h-11 w-full justify-start rounded-xl text-destructive hover:text-destructive"
          disabled={editPending} onClick={onDelete}><Trash2 className="size-4" />Delete message</Button> : null}
      </PopoverContent>
    </Popover>
    <Sheet open={picker} onOpenChange={setPicker}>
      {picker ? <SheetContent ref={setSheet} side="bottom" showCloseButton={false} finalFocus={trigger} initialFocus={pickerClose}
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
