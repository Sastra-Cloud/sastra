"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";

import {
  addProjectMember,
  removeProjectMember,
} from "@/lib/projects/member-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { usePropState } from "@/hooks/use-prop-state";

type Member = {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  roleLabel: string;
  roleColor: string | null;
};
type Option = { id: string; name: string };
type RoleOption = { id: string; label: string };

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type PersonCapacity = {
  status: "room" | "tight" | "full";
  roles: { roleId: string; used: number; capacity: number }[];
};

export function MembersManager({
  projectId,
  canEdit,
  members,
  users,
  roles,
  capacityByUser = {},
}: {
  projectId: string;
  canEdit: boolean;
  members: Member[];
  users: Option[];
  roles: RoleOption[];
  capacityByUser?: Record<string, PersonCapacity>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleMembers, setVisibleMembers] = usePropState(members);
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");

  const selectedCapacity = userId ? capacityByUser[userId] : undefined;
  const selectedRoleCapacity =
    selectedCapacity && roleId
      ? selectedCapacity.roles.find((r) => r.roleId === roleId)
      : undefined;

  const add = () => {
    const selectedUser = users.find((user) => user.id === userId);
    const selectedRole = roles.find((role) => role.id === roleId);
    if (!selectedUser || !selectedRole) return;
    const previous = visibleMembers;
    const temporaryId = `pending-${crypto.randomUUID()}`;
    setVisibleMembers((current) => [
      ...current,
      {
        id: temporaryId,
        userId: selectedUser.id,
        userName: selectedUser.name,
        userImage: null,
        roleLabel: selectedRole.label,
        roleColor: null,
      },
    ]);
    setUserId("");
    setRoleId("");
    start(async () => {
      try {
        const result = await addProjectMember(projectId, selectedUser.id, selectedRole.id);
        if (result?.id) {
          setVisibleMembers((current) =>
            current.map((member) =>
              member.id === temporaryId ? { ...member, id: result.id as string } : member
            )
          );
        }
        router.refresh();
      } catch (error) {
        setVisibleMembers(previous);
        setUserId(selectedUser.id);
        setRoleId(selectedRole.id);
        toast.error(error instanceof Error ? error.message : "Could not add the member.");
      }
    });
  };

  const remove = async (member: Member) => {
    if (!(await confirmDialog(`Remove ${member.userName} from this project?`))) return;
    const previous = visibleMembers;
    setVisibleMembers((current) => current.filter((item) => item.id !== member.id));
    start(async () => {
      try {
        await removeProjectMember(member.id);
        router.refresh();
      } catch (error) {
        setVisibleMembers(previous);
        toast.error(error instanceof Error ? error.message : "Could not remove the member.");
      }
    });
  };

  return (
    <div className="grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start">
      {canEdit ? <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-medium">Add a member</p>
          <div className="flex flex-col gap-2">
            <select
              aria-label="User"
              className={selectClass}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Select person…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Role"
              className={selectClass}
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">Select role…</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button
              onClick={add}
              disabled={pending || !userId || !roleId}
            >
              Add
            </Button>
            {userId ? (
              selectedRoleCapacity ? (
                <p
                  className={
                    selectedRoleCapacity.used >= selectedRoleCapacity.capacity
                      ? "text-xs text-destructive"
                      : "text-xs text-muted-foreground"
                  }
                >
                  This role: <b className="tabular-nums">{selectedRoleCapacity.used}/{selectedRoleCapacity.capacity}</b>{" "}
                  {selectedRoleCapacity.used >= selectedRoleCapacity.capacity
                    ? "— already at capacity; assigning will overload them."
                    : "— has room."}
                </p>
              ) : selectedCapacity && roleId ? (
                <p className="text-xs text-muted-foreground">
                  This person has no capacity set for this role. Add it in{" "}
                  <a href="/settings/team" className="text-primary hover:underline">Team settings</a>.
                </p>
              ) : selectedCapacity ? (
                <p className="text-xs text-muted-foreground">
                  Overall load: {selectedCapacity.status === "full" ? "booked up" : selectedCapacity.status === "tight" ? "nearly full" : "has room"}.
                </p>
              ) : null
            ) : null}
          </div>
        </CardContent>
      </Card> : <p className="text-sm text-muted-foreground">Ask a manager to add or change project members.</p>}

      <div className="grid min-w-0 gap-2 2xl:grid-cols-2">
        {visibleMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          visibleMembers.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <UserAvatar
                  name={m.userName}
                  image={m.userImage}
                  size="sm"
                  userId={m.userId}
                  showPresence
                />
                <span className="truncate text-sm font-medium">{m.userName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-transparent"
                  style={{
                    background: `${m.roleColor ?? "#64748b"}1a`,
                    color: m.roleColor ?? undefined,
                  }}
                >
                  {m.roleLabel}
                </Badge>
                {canEdit ? <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove member"
                  onClick={() => remove(m)}
                  disabled={pending}
                >
                  <X className="size-4" />
                </Button> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
