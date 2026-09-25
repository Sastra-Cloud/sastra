"use client";

import Link from "next/link";
import { Bell, Check, ChevronDown, UserRound } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { usePresenceControls } from "@/components/presence/presence-provider";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ManualStatus } from "@/lib/presence/status";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ManualStatus; label: string; dot: string }[] = [
  { value: "auto", label: "Active", dot: "bg-success" },
  { value: "away", label: "Away", dot: "bg-warning" },
  { value: "offline", label: "Appear offline", dot: "bg-muted-foreground" },
];

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-primary text-primary-foreground",
  admin: "bg-info text-info-foreground",
  manager: "bg-success text-success-foreground",
  member: "bg-secondary text-secondary-foreground",
};

const roleLabel = (role: string) =>
  role === "super_admin" ? "Super admin" : role;

/** Account identity cluster and menu for the desktop topbar. */
export function PresenceMenu({
  userId,
  name,
  image,
  role,
}: {
  userId: string;
  name: string;
  image: string | null;
  role: string;
}) {
  const { self, setManual } = usePresenceControls();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Open account menu"
            className="group flex max-w-72 items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted"
          />
        }
      >
        <UserAvatar name={name} image={image} userId={userId} showPresence size="sm" />
        <span className="max-w-40 truncate text-sm text-muted-foreground transition-colors group-hover:text-foreground">
          {name}
        </span>
        <Badge className={cn(ROLE_BADGE[role] ?? ROLE_BADGE.member)}>
          {roleLabel(role)}
        </Badge>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-popup-open:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-2">
            <span className="block truncate text-sm font-medium text-foreground">
              {name}
            </span>
            <span className="mt-0.5 block font-normal">
              {roleLabel(role)} account
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link href="/settings/profile" />}
            className="gap-2 px-2 py-2"
          >
            <UserRound />
            Profile settings
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/settings/notifications" />}
            className="gap-2 px-2 py-2"
          >
            <Bell />
            Notification settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2">Set your status</DropdownMenuLabel>
          {OPTIONS.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onClick={() => setManual(o.value)}
              className="gap-2 px-2 py-1.5"
            >
              <span className={cn("size-2 rounded-full", o.dot)} />
              {o.label}
              {(o.value === "auto" && self === "online") || self === o.value ? (
                <Check className="ml-auto size-3.5" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <SignOutButton menuItem />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Inline status buttons — for the mobile account sheet. */
export function PresenceStatusButtons() {
  const { setManual } = usePresenceControls();
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-muted-foreground">Your status</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setManual(o.value)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted active:scale-[0.97]"
          >
            <span className={cn("size-2 rounded-full", o.dot)} />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
