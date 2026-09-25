"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquarePlus, Search } from "lucide-react";
import { toast } from "sonner";

import { openDirectMessage } from "@/lib/chat/actions";
import type { DirectMessageCandidate } from "@/lib/chat/queries";
import { useChatNavigation } from "@/components/chat/chat-navigation-context";
import { avatarSrc } from "@/lib/users/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function NewDirectMessagePopover({
  candidates,
}: {
  candidates: DirectMessageCandidate[];
}) {
  const router = useRouter();
  const { beginNavigation } = useChatNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return candidates;
    return candidates.filter((candidate) =>
      candidate.name.toLocaleLowerCase().includes(needle)
    );
  }, [candidates, query]);

  function openConversation(userId: string) {
    if (pending) return;
    setPendingUserId(userId);
    startTransition(async () => {
      try {
        const result = await openDirectMessage(userId);
        beginNavigation(result.id);
        setOpen(false);
        router.push(`/chat/${result.id}`);
        router.refresh();
      } catch (error) {
        setPendingUserId(null);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not open the conversation."
        );
      }
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Start a direct message"
          />
        }
      >
        <MessageSquarePlus className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="px-1 pb-2 pt-1">
          <p className="text-sm font-semibold">New direct message</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose one teammate for a private conversation.
          </p>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search teammates</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search teammates"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {matches.length > 0 ? (
            matches.map((candidate) => {
              const photo = avatarSrc(candidate.image);
              const initials = candidate.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const isPending = pendingUserId === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={pending}
                  onClick={() => openConversation(candidate.id)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-primary/10 text-xs font-semibold text-primary">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photo}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {candidate.name}
                    </span>
                    <span className="block capitalize text-xs text-muted-foreground">
                      {candidate.role}
                    </span>
                  </span>
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {isPending ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : null}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-5 text-center text-sm text-muted-foreground">
              No teammates match that search.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
