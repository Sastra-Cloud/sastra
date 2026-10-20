"use client";

import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ChatReaction } from "@/lib/chat/queries";
import { summarizeReactions } from "@/lib/chat/reaction-summary";
import { cn } from "@/lib/utils";

export function MessageReactions({ reactions, isOwn, pending, onReact }: {
  reactions: ChatReaction[]; isOwn: boolean; pending: boolean; onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const summary = summarizeReactions(reactions);
  const label = `${summary.total} ${summary.total === 1 ? "reaction" : "reactions"}`;
  return <Sheet open={open} onOpenChange={setOpen}>
    <div ref={root} className={cn("conversation-reactions relative z-10 -mt-5 w-fit max-w-full", isOwn && "self-end", !summary.total && "hidden")}>
      {summary.total > 0 ? <SheetTrigger render={<button ref={trigger} type="button"
        aria-label={`View ${label}${summary.hasMine ? ", including yours" : ""}`} aria-busy={pending || undefined}
        data-has-mine={summary.hasMine || undefined}
        className="conversation-reaction flex h-11 min-w-11 max-w-full items-center justify-center rounded-full px-0.5 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring" />}>
        <span aria-hidden="true" className="conversation-reaction-badge pointer-events-none inline-flex h-7 min-w-10 items-center justify-center gap-1.5 rounded-full border px-2 text-xs text-foreground">
          <span className="flex items-center gap-0.5 text-base leading-none">{summary.preview.map(reaction => <span key={reaction.emoji}>{reaction.emoji}</span>)}</span>
          <span className={cn("tabular-nums", summary.hasMine && "font-semibold")}>{summary.total}</span>
        </span>
      </SheetTrigger> : null}
    </div>
    {open ? <SheetContent side="bottom" showCloseButton={false} initialFocus={close}
      finalFocus={() => trigger.current ?? root.current?.closest('[data-slot="message-content"]')?.querySelector<HTMLButtonElement>('button[aria-label^="Message actions"]') ?? null}
      className="conversation-reaction-details mx-auto max-h-[80dvh] max-w-md gap-0 rounded-t-2xl px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] motion-reduce:transition-none sm:bottom-6 sm:rounded-2xl sm:border">
      <div className="flex shrink-0 items-center gap-3 px-1 pb-3">
        <div className="min-w-0 flex-1"><SheetTitle>Reactions</SheetTitle><SheetDescription>{label} · {summary.ordered.length} emoji</SheetDescription></div>
        <Button ref={close} type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close reaction summary" onClick={() => setOpen(false)}><X className="size-5" /></Button>
      </div>
      {summary.total ? <>
        <p className="shrink-0 px-1 pb-2 text-xs text-muted-foreground">Tap an emoji to add or remove your reaction.</p>
        <ul className="min-h-0 space-y-1 overflow-y-auto overscroll-contain p-1" aria-label="All message reactions">
          {summary.ordered.map(reaction => <li key={reaction.emoji}><button type="button" disabled={pending} aria-pressed={reaction.mine}
            aria-label={`${reaction.mine ? "Remove your" : "Add your"} ${reaction.emoji} reaction, ${reaction.count} ${reaction.count === 1 ? "reaction" : "reactions"}`}
            onClick={() => { if (!pending) onReact(reaction.emoji); }}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:bg-muted aria-pressed:border-primary/50 aria-pressed:bg-primary/10 disabled:opacity-60">
            <span aria-hidden="true" className="text-2xl leading-none">{reaction.emoji}</span>
            {reaction.mine ? <span aria-hidden="true" className="inline-flex items-center gap-1 text-xs font-medium"><Check className="size-3.5" />Yours</span> : null}
            <span aria-hidden="true" className="ml-auto text-sm tabular-nums">{reaction.count}</span>
          </button></li>)}
        </ul>
      </> : <p className="px-1 py-5 text-sm text-muted-foreground" role="status">No reactions yet.</p>}
    </SheetContent> : null}
  </Sheet>;
}
