"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Handshake,
  IdCard,
  Mail,
  LayoutTemplate,
  Mic,
  Printer,
  ShieldCheck,
  Settings2,
  Sunrise,
  Users,
  type LucideIcon,
} from "lucide-react";

import { MotionTabLink } from "@/components/motion/tab-link";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: LucideIcon; show: boolean };
type Group = { label: string; tabs: Tab[] };

export function SettingsNav({
  canManage,
  isAdmin,
}: {
  canManage: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  const groups: Group[] = [
    {
      label: "Account",
      tabs: [
        { href: "/settings/profile", label: "Profile", icon: IdCard, show: true },
        { href: "/settings/security", label: "Security", icon: ShieldCheck, show: isAdmin },
        { href: "/settings/notifications", label: "Notifications", icon: Bell, show: true },
        { href: "/settings/dictionary", label: "Voice", icon: Mic, show: true },
      ],
    },
    {
      label: "Workspace",
      tabs: [
        { href: "/settings/team", label: "Team", icon: Users, show: canManage },
        { href: "/settings/workspace", label: "Workspace", icon: Building2, show: isAdmin },
        { href: "/settings/roles", label: "Roles", icon: Settings2, show: canManage },
        { href: "/settings/templates", label: "Templates", icon: LayoutTemplate, show: isAdmin },
        { href: "/settings/publishers", label: "Publishers", icon: Building2, show: canManage },
        { href: "/settings/partners", label: "Partners", icon: Handshake, show: canManage },
        { href: "/settings/printers", label: "Printers", icon: Printer, show: canManage },
        { href: "/settings/email", label: "Email", icon: Mail, show: canManage },
        { href: "/settings/standups", label: "Standups", icon: Sunrise, show: canManage },
        { href: "/settings/costs", label: "Costs", icon: CircleDollarSign, show: isAdmin },
        { href: "/settings/ai", label: "AI", icon: Bot, show: isAdmin },
      ],
    },
  ]
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.show) }))
    .filter((g) => g.tabs.length > 0);

  const allTabs = groups.flatMap((g) => g.tabs);
  const active =
    allTabs.find(
      (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
    ) ?? allTabs[0];

  return (
    <>
      {/* Mobile / tablet: a compact dropdown switcher */}
      <div className="lg:hidden">
        <MobileNav groups={groups} active={active} />
      </div>

      {/* Desktop: a grouped vertical sidebar */}
      <nav
        aria-label="Settings sections"
        className="hidden lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1 lg:sticky lg:top-20 lg:flex lg:flex-col lg:gap-5"
      >
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <MotionTabLink
                    key={tab.href}
                    href={tab.href}
                    active={active?.href === tab.href}
                    layoutId="settings-tab-active"
                    className="w-full justify-start"
                  >
                    <Icon className="size-4 shrink-0" />
                    {tab.label}
                  </MotionTabLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );
}

function MobileNav({ groups, active }: { groups: Group[]; active?: Tab }) {
  const [open, setOpen] = useState(false);
  const ActiveIcon = active?.icon ?? Settings2;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-sm font-medium shadow-sm outline-none transition-[background-color,box-shadow,scale] hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.99]"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <ActiveIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="truncate">{active?.label ?? "Settings"}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[82dvh] gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="border-b pr-14">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Choose what you want to manage.</SheetDescription>
        </SheetHeader>
        <nav
          aria-label="Settings sections"
          className="space-y-5 overflow-y-auto overscroll-contain px-3 py-4"
        >
          {groups.map((group) => (
            <section key={group.label} className="space-y-1">
              <h2 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </h2>
              <div className="grid gap-1">
                {group.tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = active?.href === tab.href;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={isActive ? "page" : undefined}
                      onNavigate={() => setOpen(false)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none transition-[background-color,color,scale] focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98]",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                      {isActive ? <Check className="size-4 shrink-0" /> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
