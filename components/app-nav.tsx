"use client";

import type * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  FolderKanban,
  BriefcaseBusiness,
  MessageSquare,
  Mail,
  Sparkles,
  Sunrise,
  Users,
  Settings,
  CircleHelp,
  Gauge,
  CalendarRange,
  BookOpenText,
  HandCoins,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TODAY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "My Work", icon: BriefcaseBusiness },
  { href: "/standups", label: "Standups", icon: Sunrise },
];

const WORK_NAV = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/correspondence", label: "Correspondence", icon: Mail, manageOnly: true },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

const MANAGER_NAV = [
  { href: "/overview", label: "Overview", icon: Gauge },
  { href: "/schedule", label: "Schedule", icon: CalendarRange },
  { href: "/workload", label: "Workload", icon: Users },
  { href: "/donations", label: "Donations", icon: HandCoins, adminOnly: true },
];

const SETTINGS_NAV = [
  { href: "/wiki", label: "Wiki", icon: BookOpenText },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

export function AppNav({
  onNavigate,
  canManage = false,
  isAdmin = false,
  collapsed = false,
  layoutScope = "primary",
}: {
  onNavigate?: () => void;
  canManage?: boolean;
  isAdmin?: boolean;
  collapsed?: boolean;
  /**
   * Distinguishes nav instances that are mounted at the same time (the desktop
   * rail vs. the mobile sheet) so their sliding indicators never share a
   * `layoutId` and fight over position.
   */
  layoutScope?: string;
}) {
  const mobile = layoutScope === "mobile";

  return (
    <TooltipProvider delay={250}>
      <nav className={cn("grid gap-5", collapsed && "gap-4")}>
        <div className={cn("grid gap-1", collapsed && "justify-items-center")}>
          <NavLabel collapsed={collapsed} mobile={mobile}>Today</NavLabel>
          {TODAY_NAV.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              onNavigate={onNavigate}
              collapsed={collapsed}
              mobile={mobile}
              layoutId={`nav-${layoutScope}-today`}
            />
          ))}
        </div>

        <div className={cn("grid gap-1", collapsed && "justify-items-center")}>
          <NavLabel collapsed={collapsed} mobile={mobile}>Work</NavLabel>
          {WORK_NAV.filter((item) => !item.manageOnly || canManage).map((item) => (
            <NavItem
              key={item.href}
              item={item}
              onNavigate={onNavigate}
              collapsed={collapsed}
              mobile={mobile}
              layoutId={`nav-${layoutScope}-work`}
            />
          ))}
        </div>

        {canManage ? (
          <div className={cn("grid gap-1", collapsed && "justify-items-center")}>
            <NavLabel collapsed={collapsed} mobile={mobile}>Management</NavLabel>
            {MANAGER_NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
              <NavItem
                key={item.href}
                item={item}
                onNavigate={onNavigate}
                collapsed={collapsed}
                mobile={mobile}
                layoutId={`nav-${layoutScope}-manage`}
              />
            ))}
          </div>
        ) : null}

        <div className={cn("grid gap-1", collapsed && "justify-items-center")}>
          <NavLabel collapsed={collapsed} mobile={mobile}>Workspace</NavLabel>
          {SETTINGS_NAV.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              onNavigate={onNavigate}
              collapsed={collapsed}
              mobile={mobile}
              layoutId={`nav-${layoutScope}-workspace`}
            />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  );
}

function NavLabel({
  children,
  collapsed,
  mobile,
}: {
  children: React.ReactNode;
  collapsed?: boolean;
  mobile?: boolean;
}) {
  if (collapsed) {
    return (
      <span
        aria-hidden="true"
        className="mx-auto my-1 block h-px w-6 rounded-full bg-sidebar-border/80"
      />
    );
  }

  return (
    <p
      className={cn(
        "px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45",
        mobile ? "block" : "hidden xl:block"
      )}
    >
      {children}
    </p>
  );
}

function NavItem({
  item,
  onNavigate,
  collapsed,
  mobile,
  layoutId,
}: {
  item: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  onNavigate?: () => void;
  collapsed?: boolean;
  mobile?: boolean;
  layoutId: string;
}) {
  const pathname = usePathname();
  const active =
    pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  const navLink = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "group relative flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium outline-none transition-[color,box-shadow,scale] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 active:scale-[0.96]",
        collapsed
          ? "size-12 justify-center rounded-2xl px-0 py-0"
          : mobile
            ? "min-h-12 justify-start"
            : "justify-center xl:justify-start",
        active
          ? "text-sidebar-primary-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      {active ? (
        <motion.span
          aria-hidden
          layoutId={layoutId}
          className={cn(
            "absolute inset-0 bg-sidebar-primary",
            collapsed
              ? "rounded-2xl shadow-md ring-1 ring-sidebar-primary/20"
              : "rounded-lg shadow-sm"
          )}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <span
        className={cn(
          "relative z-10 flex items-center gap-3",
          collapsed
            ? "justify-center"
            : mobile
              ? "justify-start"
              : "justify-center xl:justify-start"
        )}
      >
        <Icon
          className={cn(
            "size-4 shrink-0 transition-colors",
            (collapsed || mobile) && "size-5",
            active
              ? "text-current"
              : "text-sidebar-foreground/45 group-hover:text-current"
          )}
        />
        <span
          className={cn(
            "truncate",
            collapsed ? "sr-only" : mobile ? "inline" : "hidden xl:inline"
          )}
        >
          {item.label}
        </span>
      </span>
    </Link>
  );

  if (mobile) return navLink;

  return (
    <Tooltip>
      <TooltipTrigger render={navLink} />
      <TooltipContent
        side="right"
        sideOffset={10}
        className={cn("font-medium", !collapsed && "xl:hidden")}
      >
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}
