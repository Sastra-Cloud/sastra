"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

import {
  inviteMember,
  revokeInvitation,
  setUserActive,
  setUserRole,
  updateUserWeeklyHours,
  type TeamState,
} from "@/lib/team/actions";
import { setAssistantBudget } from "@/lib/assistant/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { formatDate } from "@/lib/format";
import { usePropState } from "@/hooks/use-prop-state";
import { cn } from "@/lib/utils";
import {
  asTeamRole,
  canManageTeamRole,
  isAdminRole,
  ROLE_RANK,
  type TeamRole,
} from "@/lib/auth/policy";

type Member = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  weeklyHours: number;
  isActive: boolean;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  invitedByName: string | null;
};

const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

type AssistantBudget = { budgetUsd: number; enabled: boolean; spentUsd: number };

export function TeamManager({
  members,
  invitations,
  currentUserId,
  currentUserRole,
  assistantBudgets = {},
}: {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  currentUserRole: string | null | undefined;
  assistantBudgets?: Record<string, AssistantBudget>;
}) {
  const actorRole = asTeamRole(currentUserRole) ?? "member";
  const isAdmin = isAdminRole(actorRole);
  const canManageRole = (role: string) => {
    return isAdmin && canManageTeamRole(actorRole, role);
  };
  const inviteRoles = (
    ["member", "manager", "admin", "super_admin"] as TeamRole[]
  ).filter((role) => ROLE_RANK[role] <= ROLE_RANK[actorRole]);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [visibleMembers, setVisibleMembers] = usePropState(members);
  const [visibleInvitations, setVisibleInvitations] = usePropState(invitations);
  const [state, action, inviting] = useActionState(
    inviteMember,
    {} as TeamState
  );

  useEffect(() => {
    if (state.ok && !state.emailFailed) {
      toast.success("Invitation sent");
      router.refresh();
    } else if (state.ok && state.emailFailed) {
      toast.warning(
        "Invite created, but the email couldn't be sent — copy the link below to share it."
      );
      router.refresh();
    }
  }, [state, router]);

  const run = (fn: () => Promise<unknown>, rollback?: () => void) =>
    start(async () => {
      try {
        const result = await fn();
        if (result && typeof result === "object" && "error" in result && result.error) {
          throw new Error(String(result.error));
        }
        router.refresh();
      } catch (error) {
        rollback?.();
        toast.error(error instanceof Error ? error.message : "Could not save the team change.");
      }
    });

  const updateMember = (id: string, patch: Partial<Member>) =>
    setVisibleMembers((current) =>
      current.map((member) => (member.id === id ? { ...member, ...patch } : member))
    );

  return (
    <div className="space-y-6">
      {/* Invite */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <p className="text-sm font-medium">Invite a teammate</p>
          <form action={action} className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="email"
              type="email"
              placeholder="name@example.com"
              required
              className="flex-1"
            />
            <select name="role" className={selectClass} defaultValue="member">
              {inviteRoles.map((role) => (
                <option key={role} value={role}>
                  {role === "super_admin"
                    ? "Super admin"
                    : role[0].toUpperCase() + role.slice(1)}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={inviting}>
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {state.emailFailed && state.inviteUrl ? (
            <div className="space-y-1.5 rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-medium text-warning-foreground">
                Couldn&apos;t email this invite — share the link manually:
              </p>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={state.inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(state.inviteUrl ?? "");
                    toast.success("Link copied");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Members */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Members ({visibleMembers.length})</p>
        <div aria-busy={pending}>
          {visibleMembers.map((m) => {
            const isSelf = m.id === currentUserId;
            return (
              <div
                key={m.id}
                className="flex flex-col gap-3 rounded-xl border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-2"
              >
                <div className="flex min-w-0 w-full items-center gap-2.5 sm:w-auto">
                  <UserAvatar
                    name={m.name}
                    image={m.image}
                    size="sm"
                    userId={m.id}
                    showPresence
                  />
                  <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.name}
                    {isSelf ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (you)
                      </span>
                    ) : null}
                    {!m.isActive ? (
                      <Badge variant="secondary" className="ml-2">
                        Inactive
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                  </p>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                  <label className="grid min-w-0 gap-1 text-xs text-muted-foreground sm:flex sm:items-center">
                    <span>Hrs/wk</span>
                    <span className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="168"
                      defaultValue={m.weeklyHours}
                      aria-label={`Weekly hours for ${m.name}`}
                      className="h-9 min-w-0 flex-1 tabular-nums sm:h-8 sm:w-16 sm:flex-none"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== m.weeklyHours) {
                          const previous = m.weeklyHours;
                          updateMember(m.id, { weeklyHours: v });
                          run(
                            () => updateUserWeeklyHours(m.id, v),
                            () => updateMember(m.id, { weeklyHours: previous })
                          );
                        }
                      }}
                    />
                    <HelpTip iconClassName="size-3" label="About weekly hours">
                      Each person&apos;s weekly capacity. Combined with task hour
                      estimates, it drives the utilization % on the Portfolio.
                    </HelpTip>
                    </span>
                  </label>
                  {isAdmin ? (
                    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground sm:flex sm:items-center">
                      <span>AI $/mo</span>
                      <span className="flex min-w-0 items-center gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="1000"
                        step="1"
                        defaultValue={assistantBudgets[m.id]?.budgetUsd ?? 5}
                        aria-label={`Monthly AI budget for ${m.name}`}
                        className="h-9 min-w-0 flex-1 tabular-nums sm:h-8 sm:w-16 sm:flex-none"
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== (assistantBudgets[m.id]?.budgetUsd ?? 5))
                            run(() => setAssistantBudget(m.id, v));
                        }}
                      />
                      <span className="tabular-nums">
                        (${(assistantBudgets[m.id]?.spentUsd ?? 0).toFixed(2)})
                      </span>
                      <HelpTip iconClassName="size-3" label="About the AI budget">
                        Monthly cap on this person&apos;s AI assistant spend via
                        OpenRouter, with current month-to-date spend shown. The
                        assistant stops at the cap; resets each month. Default $5.
                      </HelpTip>
                      </span>
                    </label>
                  ) : null}
                  {canManageRole(m.role) && !isSelf ? (
                    <select
                      className={cn(selectClass, "w-full sm:w-auto")}
                      value={m.role}
                      onChange={(e) => {
                        const previous = m.role;
                        const role = e.target.value;
                        updateMember(m.id, { role });
                        run(
                          () => setUserRole(m.id, role),
                          () => updateMember(m.id, { role: previous })
                        );
                      }}
                    >
                      <option value="member">Member</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      {actorRole === "super_admin" ? (
                        <option value="super_admin">Super admin</option>
                      ) : null}
                    </select>
                  ) : (
                    <Badge variant="outline" className="h-9 justify-center sm:h-auto">
                      {m.role === "super_admin" ? "Super admin" : m.role}
                    </Badge>
                  )}
                  {canManageRole(m.role) && !isSelf ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        const previous = m.isActive;
                        updateMember(m.id, { isActive: !previous });
                        run(
                          () => setUserActive(m.id, !previous),
                          () => updateMember(m.id, { isActive: previous })
                        );
                      }}
                    >
                      {m.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending invites */}
      {visibleInvitations.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Pending invitations ({visibleInvitations.length})
          </p>
          {visibleInvitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  <span>
                    {inv.role === "super_admin" ? "Super admin" : inv.role}
                  </span>{" "}
                  · expires{" "}
                  {formatDate(inv.expiresAt.toISOString().slice(0, 10))}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Revoke invitation"
                onClick={async () => {
                  if (!(await confirmDialog(`Revoke the invitation for ${inv.email}?`))) return;
                  const previous = visibleInvitations;
                  setVisibleInvitations((current) =>
                    current.filter((item) => item.id !== inv.id)
                  );
                  run(
                    () => revokeInvitation(inv.id),
                    () => setVisibleInvitations(previous)
                  );
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
