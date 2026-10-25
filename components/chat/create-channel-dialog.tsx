"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import type { CreateChannelState } from "@/lib/chat/actions";
import type { DirectMessageCandidate } from "@/lib/chat/queries";
import { readChannelDraft, saveChannelDraft } from "@/lib/chat/channel-draft";
import { BEFORE_APP_REFRESH_EVENT } from "@/lib/pwa/client-update";
import { useChatNavigation } from "@/components/chat/chat-navigation-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";

export function CreateChannelDialog({
  candidates,
  currentUserId,
}: {
  candidates: DirectMessageCandidate[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { beginNavigation } = useChatNavigation();
  const draftKey = `sastra:channel-draft:v1:${currentUserId}`;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [state, setState] = useState<CreateChannelState>({});
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const draft = readChannelDraft(sessionStorage, draftKey);
      if (draft) {
        // Restore only after hydration, and only teammates still available now.
        /* eslint-disable react-hooks/set-state-in-effect */
        setName(draft.name);
        setSelectedIds(draft.memberIds.filter((id) => candidates.some((candidate) => candidate.id === id)));
        setOpen(true);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch { /* Storage can be unavailable; keep the current form usable. */ }
  }, [draftKey, candidates]);

  useEffect(() => {
    if (!open) return;
    const save = (event: Event) => {
      try {
        if (!draftKey || inFlight.current) throw new Error("Draft cannot be saved yet");
        saveChannelDraft(sessionStorage, draftKey, { name, memberIds: selectedIds });
      } catch {
        event.preventDefault();
        toast.error("Could not keep this draft. Copy the channel details before refreshing.");
      }
    };
    window.addEventListener(BEFORE_APP_REFRESH_EVENT, save);
    return () => window.removeEventListener(BEFORE_APP_REFRESH_EVENT, save);
  }, [draftKey, open, name, selectedIds]);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return candidates;
    return candidates.filter((candidate) =>
      candidate.name.toLocaleLowerCase().includes(needle)
    );
  }, [candidates, query]);

  function submit(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const response = await fetch("/api/chat/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formData.get("name"), memberIds: formData.getAll("memberIds") }),
        });
        const result = await response.json() as CreateChannelState;
        if (!response.ok && !result.error) throw new Error("Channel creation was not confirmed");
        setState(result);
        if (!result.ok || !result.id) return;

        setOpen(false);
        setName("");
        setSelectedIds([]);
        if (draftKey) {
          try { sessionStorage.removeItem(draftKey); } catch { /* Best effort. */ }
        }
        toast.success("Channel created");
        beginNavigation(result.id);
        router.push(`/chat/${result.id}`);
        router.refresh();
      } catch {
        const message = "Could not confirm creation. Check the channel list before trying again.";
        setState({ error: message });
        toast.error(message);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (inFlight.current) return;
        setOpen(nextOpen);
        if (!nextOpen) {
          try { sessionStorage.removeItem(draftKey); } catch { /* Best effort. */ }
          setName("");
          setQuery("");
          setSelectedIds([]);
          setState({});
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            aria-label="New channel"
          />
        }
      >
        <Plus className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
          <DialogDescription>
            Create a focused space for a specific group of teammates.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }} className="grid gap-4" aria-busy={pending}>
          <div className="grid gap-2">
            <Label htmlFor="ch-name">Channel name</Label>
            <Input
              id="ch-name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              required
              autoFocus
              maxLength={60}
              placeholder="e.g. announcements"
            />
            <p className="text-xs text-muted-foreground">
              You&apos;ll be included automatically. Only members can find and
              open this channel.
            </p>
          </div>

          <fieldset className="grid min-w-0 gap-2" disabled={pending}>
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-medium">Add teammates</legend>
              <span className="text-xs tabular-nums text-muted-foreground">
                {selectedIds.length} selected
              </span>
            </div>
            {candidates.length > 4 ? (
              <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <span className="sr-only">Search teammates</span>
                <input
                  type="text"
                  role="searchbox"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search teammates"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>
            ) : null}
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">
              {matches.length > 0 ? (
                matches.map((candidate) => {
                  const checked = selectedIds.includes(candidate.id);
                  return (
                    <label
                      key={candidate.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted"
                    >
                      <Checkbox
                        disabled={pending}
                        checked={checked}
                        onCheckedChange={(nextChecked) =>
                          setSelectedIds((current) =>
                            nextChecked === true
                              ? [...current, candidate.id]
                              : current.filter((id) => id !== candidate.id)
                          )
                        }
                      />
                      <UserAvatar
                        name={candidate.name}
                        image={candidate.image}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {candidate.name}
                        </span>
                        <span className="block text-xs capitalize text-muted-foreground">
                          {candidate.role}
                        </span>
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {query.trim()
                    ? "No teammates match that search."
                    : "No other active teammates are available."}
                </p>
              )}
            </div>
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="memberIds" value={id} />
            ))}
          </fieldset>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
