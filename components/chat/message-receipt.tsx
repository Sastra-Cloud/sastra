"use client";

import { Check, CheckCheck } from "lucide-react";

import type { ChatMessageView } from "@/lib/chat/queries";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export function MessageReceipt({ message, direct }: { message: ChatMessageView; direct: boolean }) {
  if (!message.isMine || message.status !== "sent" || message.id.startsWith("pending-")) return null;
  const readers = message.seenBy ?? [];
  if (readers.length === 0) {
    return <span role="img" aria-label="Sent" title="Sent"><Check aria-hidden className="size-3.5" /></span>;
  }
  if (direct) {
    return (
      <span role="img" className="inline-flex items-center gap-1" aria-label={`Seen by ${readers[0].name}`} title={`Seen by ${readers[0].name}`}>
        <CheckCheck aria-hidden className="size-3.5 shrink-0" />
        Seen
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`View who has seen this message (${readers.length})`}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [@media(pointer:coarse)]:min-h-11"
      >
        <CheckCheck aria-hidden className="size-3.5 shrink-0" />
        Seen by {readers.length}
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="max-w-[calc(100vw-2rem)] motion-reduce:animate-none">
        <PopoverTitle>Seen by</PopoverTitle>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {readers.map(reader => <li key={reader.id} className="break-words">{reader.name}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
