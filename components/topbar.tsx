"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { Bell, Menu, UserRound } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import {
  PresenceMenu,
  PresenceStatusButtons,
} from "@/components/presence/presence-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppNav } from "@/components/app-nav";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { TimerWidget } from "@/components/time/timer-widget";
import { cn } from "@/lib/utils";
import { isAdminRole } from "@/lib/auth/policy";

const ROLE_BADGE: Record<string, string> = {
  super_admin: "bg-primary text-primary-foreground",
  admin: "bg-info text-info-foreground",
  manager: "bg-success text-success-foreground",
  member: "bg-secondary text-secondary-foreground",
};

const roleLabel = (role: string) =>
  role === "super_admin" ? "Super admin" : role;

export function Topbar({
  userId,
  userName,
  userImage,
  role,
  canManage = false,
}: {
  userId: string;
  userName: string;
  userImage: string | null;
  role: string;
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  function closeAccountAfterNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.currentTarget.target === "_blank"
    ) {
      return;
    }
    requestAnimationFrame(() => setAccountOpen(false));
  }

  return (
    <header className="sticky top-0 z-20 border-b bg-background/88 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        {/* Mobile nav */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open menu"
              />
            }
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent
            side="left"
            className="gap-0 overflow-y-auto p-0 pb-[env(safe-area-inset-bottom)] data-[side=left]:w-[min(21rem,88vw)] data-[side=left]:max-w-none"
          >
            <SheetHeader className="border-b px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
              <SheetTitle>
                <Brand />
              </SheetTitle>
            </SheetHeader>
            <div className="px-3 py-4">
              <AppNav
                onNavigate={() => setOpen(false)}
                canManage={canManage}
                isAdmin={isAdminRole(role)}
                layoutScope="mobile"
              />
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/dashboard" className="lg:hidden">
          <Brand textClassName="hidden sm:inline" />
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden lg:block">
            <PresenceMenu
              userId={userId}
              name={userName}
              image={userImage}
              role={role}
            />
          </div>
          <NotificationBell />
          <TimerWidget />
          <ThemeToggle />
          <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open account menu"
                />
              }
            >
              <UserAvatar
                name={userName}
                image={userImage}
                size="sm"
                userId={userId}
                showPresence
              />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>Account</SheetTitle>
                <SheetDescription>
                  Signed in as {userName}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-4 px-4">
                <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                  <UserAvatar
                    name={userName}
                    image={userImage}
                    size="lg"
                    userId={userId}
                    showPresence
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{userName}</p>
                    <Badge
                      className={cn("mt-1", ROLE_BADGE[role] ?? ROLE_BADGE.member)}
                    >
                      {roleLabel(role)}
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-1">
                  <Button
                    nativeButton={false}
                    render={
                      <Link
                        href="/settings/profile"
                        onClick={closeAccountAfterNavigation}
                      />
                    }
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <UserRound />
                    Profile settings
                  </Button>
                  <Button
                    nativeButton={false}
                    render={
                      <Link
                        href="/settings/notifications"
                        onClick={closeAccountAfterNavigation}
                      />
                    }
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                  >
                    <Bell />
                    Notification settings
                  </Button>
                </div>
                <PresenceStatusButtons />
                <SignOutButton className="w-full justify-start" />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
