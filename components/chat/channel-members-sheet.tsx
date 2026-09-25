"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, UserMinus, UserPlus, Users } from "lucide-react";

import {
  addChannelMember,
  removeChannelMember,
} from "@/lib/chat/actions";
import {
  updateChannelMembers,
  type ChannelMember,
  type ChannelMembershipChange,
} from "@/lib/chat/channel-members";
import type { DirectMessageCandidate } from "@/lib/chat/queries";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
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

export function ChannelMembersSheet({
  channelId,
  channelName,
  members,
  candidates,
  currentUserId,
  canManage,
}: {
  channelId: string;
  channelName: string;
  members: ChannelMember[];
  candidates: DirectMessageCandidate[];
  currentUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const membership = useOptimisticAction<
    ChannelMember[],
    ChannelMembershipChange
  >({
    state: members,
    update: updateChannelMembers,
    getKey: (change) => change.member.id,
  });
  const available = useMemo(() => {
    const memberIds = new Set(membership.state.map((member) => member.id));
    const needle = query.trim().toLocaleLowerCase();
    return candidates.filter(
      (candidate) =>
        !memberIds.has(candidate.id) &&
        (!needle ||
          candidate.name.toLocaleLowerCase().includes(needle))
    );
  }, [candidates, membership.state, query]);

  function addMember(candidate: DirectMessageCandidate) {
    const member: ChannelMember = {
      id: candidate.id,
      name: candidate.name,
      image: candidate.image,
      role: candidate.role,
    };
    membership.run(
      { type: "add", member },
      () => addChannelMember({ channelId, userId: member.id }),
      {
        errorMessage: `Could not add ${member.name} to the channel.`,
        reconcile: (saved, current) =>
          current.map((item) => (item.id === saved.id ? saved : item)),
        onSuccess: () => router.refresh(),
      }
    );
  }

  async function removeMember(member: ChannelMember) {
    if (
      !(await confirmDialog(`Remove ${member.name} from #${channelName}? They will immediately lose access to this conversation and its files.`))
    ) {
      return;
    }
    membership.run(
      { type: "remove", member },
      () => removeChannelMember({ channelId, userId: member.id }),
      {
        errorMessage: `Could not remove ${member.name} from the channel.`,
        onSuccess: () => router.refresh(),
      }
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" aria-label="View channel members" />
        }
      >
        <Users className="size-4" />
        {membership.state.length}{" "}
        {membership.state.length === 1 ? "member" : "members"}
      </SheetTrigger>
      <SheetContent className="w-[calc(100%-1rem)] sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>#{channelName} members</SheetTitle>
          <SheetDescription>
            {canManage
              ? "Add teammates or remove access from this private team channel."
              : "Only these teammates can open this channel and its files."}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <section aria-labelledby="current-channel-members">
            <div className="flex items-center justify-between gap-3 py-3">
              <h2 id="current-channel-members" className="text-sm font-semibold">
                Current members
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {membership.state.length}
              </span>
            </div>
            <div className="divide-y rounded-lg border">
              {membership.state.map((member) => {
                const isSelf = member.id === currentUserId;
                const pending = membership.isPending(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex min-h-14 items-center gap-2.5 px-3 py-2"
                    aria-busy={pending}
                  >
                    <UserAvatar
                      name={member.name}
                      image={member.image}
                      size="sm"
                      userId={member.id}
                      showPresence
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {member.name}
                        {isSelf ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {member.role}
                      </span>
                    </span>
                    {pending ? (
                      <span className="flex size-8 items-center justify-center">
                        <Loader2
                          className="size-4 animate-spin text-muted-foreground"
                          aria-hidden
                        />
                        <span className="sr-only">Saving membership</span>
                      </span>
                    ) : canManage && !isSelf ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeMember(member)}
                        aria-label={`Remove ${member.name} from the channel`}
                        title="Remove from channel"
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {canManage ? (
            <section className="mt-5" aria-labelledby="add-channel-members">
              <div className="pb-2">
                <h2 id="add-channel-members" className="text-sm font-semibold">
                  Add people
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  New members can see the existing conversation history.
                </p>
              </div>
              {candidates.length > 4 ? (
                <label className="mb-2 flex min-h-10 items-center gap-2 rounded-lg border bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35">
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <span className="sr-only">Search teammates to add</span>
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
              <div className="space-y-1">
                {available.length > 0 ? (
                  available.map((candidate) => {
                    const pending = membership.isPending(candidate.id);
                    return (
                      <div
                        key={candidate.id}
                        className="flex min-h-12 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                        aria-busy={pending}
                      >
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => addMember(candidate)}
                        >
                          {pending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <UserPlus className="size-4" />
                          )}
                          Add
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-lg bg-muted/60 px-3 py-6 text-center text-sm text-muted-foreground">
                    {query.trim()
                      ? "No teammates match that search."
                      : "Everyone available is already in this channel."}
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
