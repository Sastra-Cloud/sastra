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
import { GuidanceProvider, type GuidanceSnapshot } from "@/components/guidance/guidance-provider";
import { PerformanceReporter } from "@/components/observability/performance-reporter";
import { PresenceProvider } from "@/components/presence/presence-provider";
import { PullToRefresh } from "@/components/pwa/pull-to-refresh";
import { RouteScrollManager } from "@/components/route-scroll-manager";
import type { ActiveTimer } from "@/lib/tasks/time-queries";
import { cn } from "@/lib/utils";
import { ActiveTimerProvider } from "@/components/time/active-timer-provider";
import { AppCanvas } from "@/components/cockpit";
import { isAdminRole } from "@/lib/auth/policy";
import { WorkspaceModulesProvider } from "@/components/settings/workspace-modules-provider";
import { NavigationBadgesProvider } from "@/components/navigation-badges-provider";
import type { NavigationBadgeCounts } from "@/lib/navigation/badges";
import { FrequentReactionsProvider } from "@/components/chat/frequent-reactions-provider";
import { VoicePlaybackProvider } from "@/components/chat/voice-playback-provider";
import { PinnedTasksCanvas, PinnedTasksProvider, PinnedTasksWorkspace } from "@/components/tasks/pinned-tasks-provider";

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
  guidanceSnapshot,
  sourceUrl,
  versionLabel,
  enabledModules = [],
  navigationBadgesSnapshot,
  performanceMonitoring = false,
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
  /** Streams in after first paint; null when it could not be loaded. */
  guidanceSnapshot: Promise<GuidanceSnapshot | null>;
  /** AGPL source link for the running build. */
  sourceUrl: string;
  versionLabel: string | null;
  enabledModules?: string[];
  /** Streams in after first paint; null when it could not be loaded. */
  navigationBadgesSnapshot: Promise<NavigationBadgeCounts | null>;
  /** Operator opt-in (SASTRA_PERFORMANCE_MONITORING) for anonymous performance reports. */
  performanceMonitoring?: boolean;
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
    <PinnedTasksProvider key={userId} userId={userId}>
    <FrequentReactionsProvider key={userId} userId={userId}>
    <VoicePlaybackProvider key={userId}>
    <WorkspaceModulesProvider enabledModules={enabledModules}>
    <NavigationBadgesProvider snapshot={navigationBadgesSnapshot}>
    <GuidanceProvider
      enabled={guidanceEnabled}
      snapshot={guidanceSnapshot}
    >
    <ActiveTimerProvider initialActiveTimer={initialActiveTimer}>
    <PresenceProvider userId={userId}>
    <PullToRefresh />
    <RouteScrollManager />
    <div
      className={cn(
        "grid min-h-dvh bg-background lg:grid-cols-[5rem_minmax(0,1fr)]",
        collapsed
          ? "xl:grid-cols-[5rem_minmax(0,1fr)]"
          : "xl:grid-cols-[16rem_minmax(0,1fr)]"
      )}
    >
      <aside data-app-sidebar className="sticky top-0 hidden h-dvh min-h-0 self-start overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div
          className={cn(
            "flex shrink-0 items-center px-3",
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
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain py-3", collapsed ? "px-2" : "px-3")}>
          <AppNav
            canManage={canManage}
            isAdmin={isAdminRole(role)}
            collapsed={collapsed}
          />
        </div>
        <div className={cn("shrink-0 py-3", collapsed ? "px-2 text-center" : "px-3 xl:px-4")}>
          <SourceLink href={sourceUrl} version={versionLabel} compact={collapsed} />
        </div>
      </aside>

      <PinnedTasksWorkspace>
        <Topbar
          userId={userId}
          userName={userName}
          userImage={userImage}
          role={role}
          canManage={canManage}
        />
        <PinnedTasksCanvas>
        <main data-app-main className="min-w-0 flex-1 overflow-x-clip px-4 py-5 md:px-8 md:py-7">
          <AppCanvas>{children}</AppCanvas>
        </main>
        </PinnedTasksCanvas>
      </PinnedTasksWorkspace>
    </div>
    <FloatingAssistant userName={userName} />
    {performanceMonitoring ? <PerformanceReporter /> : null}
    </PresenceProvider>
    </ActiveTimerProvider>
    </GuidanceProvider>
    </NavigationBadgesProvider>
    </WorkspaceModulesProvider>
    </VoicePlaybackProvider>
    </FrequentReactionsProvider>
    </PinnedTasksProvider>
  );
}
