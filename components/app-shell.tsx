"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { AppNav } from "@/components/app-nav";
import { Brand } from "@/components/brand";
import { SourceLink } from "@/components/source-link";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/topbar";
import { FloatingAssistant } from "@/components/assistant/floating-assistant";
import { GuidanceProvider } from "@/components/guidance/guidance-provider";
import { PresenceProvider } from "@/components/presence/presence-provider";
import { PullToRefresh } from "@/components/pwa/pull-to-refresh";
import { RouteScrollManager } from "@/components/route-scroll-manager";
import type { ActiveTimer } from "@/lib/tasks/time-queries";
import { cn } from "@/lib/utils";
import { ActiveTimerProvider } from "@/components/time/active-timer-provider";
import { AppCanvas } from "@/components/cockpit";
import { isAdminRole } from "@/lib/auth/policy";

const SIDEBAR_COOKIE = "sastra-sidebar-collapsed";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persistSidebarPreference(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${
    collapsed ? "1" : "0"
  }; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function AppShell({
  children,
  userId,
  userName,
  userImage,
  role,
  canManage,
  initialSidebarCollapsed,
  initialActiveTimer,
  guidanceEnabled,
  initialGuidanceDismissals,
  sourceUrl,
  versionLabel,
}: {
  children: React.ReactNode;
  userId: string;
  userName: string;
  userImage: string | null;
  role: string;
  canManage: boolean;
  initialSidebarCollapsed: boolean;
  initialActiveTimer: ActiveTimer | null;
  guidanceEnabled: boolean;
  initialGuidanceDismissals: string[];
  /** AGPL source link for the running build. */
  sourceUrl: string;
  versionLabel: string | null;
}) {
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      persistSidebarPreference(next);
      return next;
    });
  }

  return (
    <GuidanceProvider
      enabled={guidanceEnabled}
      initialDismissedKeys={initialGuidanceDismissals}
    >
    <ActiveTimerProvider initialActiveTimer={initialActiveTimer}>
    <PresenceProvider userId={userId}>
    <PullToRefresh />
    <RouteScrollManager />
    <div
      className={cn(
        "grid min-h-full bg-background lg:grid-cols-[5rem_minmax(0,1fr)]",
        collapsed
          ? "xl:grid-cols-[5rem_minmax(0,1fr)]"
          : "xl:grid-cols-[16rem_minmax(0,1fr)]"
      )}
    >
      <aside className="hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div
          className={cn(
            "flex items-center px-3",
            collapsed
              ? "h-28 flex-col justify-center gap-2"
              : "h-16 justify-between gap-3 xl:px-4"
          )}
        >
          <Link
            href="/dashboard"
            className={cn("min-w-0", !collapsed && "flex h-10 items-center")}
          >
            <Brand
              showText={!collapsed}
              textClassName="hidden xl:inline"
              className={collapsed ? "justify-center" : undefined}
              iconClassName={collapsed ? "size-8" : undefined}
            />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "hidden shrink-0 rounded-full border border-sidebar-border bg-sidebar-accent/60 text-sidebar-foreground/70 shadow-sm transition-[background-color,color,box-shadow,scale] duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-md active:scale-[0.96] xl:inline-flex",
              collapsed ? "size-10" : "size-9"
            )}
            onClick={toggleSidebar}
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
          </Button>
        </div>
        <div className={cn("py-3", collapsed ? "px-2" : "px-3")}>
          <AppNav
            canManage={canManage}
            isAdmin={isAdminRole(role)}
            collapsed={collapsed}
          />
        </div>
        <div className={cn("mt-auto py-3", collapsed ? "px-2 text-center" : "px-3 xl:px-4")}>
          <SourceLink href={sourceUrl} version={versionLabel} compact={collapsed} />
        </div>
      </aside>

      <div className="flex min-h-full min-w-0 flex-col">
        <Topbar
          userId={userId}
          userName={userName}
          userImage={userImage}
          role={role}
          canManage={canManage}
        />
        <main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 md:px-8 md:py-7">
          <AppCanvas>{children}</AppCanvas>
        </main>
      </div>
    </div>
    <FloatingAssistant userName={userName} />
    </PresenceProvider>
    </ActiveTimerProvider>
    </GuidanceProvider>
  );
}
