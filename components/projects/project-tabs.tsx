"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  BookCopy,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Podcast,
  ShieldCheck,
  Users,
  Video,
  WalletCards,
} from "lucide-react";

import { TabScroller } from "@/components/cockpit";
import { MotionTabLink } from "@/components/motion/tab-link";
import { isEpisodicKind } from "@/lib/projects/kinds";

export function ProjectTabs({
  slug,
  kind,
}: {
  slug: string;
  kind?: string | null;
}) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const base = `/projects/${slug}`;
  const isEpisodic = isEpisodicKind(kind);
  // Episodic kinds (podcasts, video series) publish episodes rather than
  // printing books: swap the Print tab for an Episodes tab. A video series uses
  // a "Videos" label + video icon. Everything else is shared across kinds.
  const productionTab = isEpisodic
    ? {
        href: `${base}/episodes`,
        label: kind === "video_series" ? "Videos" : "Episodes",
        icon: kind === "video_series" ? Video : Podcast,
      }
    : { href: `${base}/print`, label: "Print", icon: BookCopy };
  const tabs = [
    { href: base, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/tasks`, label: "Tasks", icon: ListChecks },
    { href: `${base}/chat`, label: "Chat", icon: MessageSquare },
    { href: `${base}/rights`, label: "Rights", icon: ShieldCheck },
    { href: `${base}/budget`, label: "Budget", icon: WalletCards },
    productionTab,
    { href: `${base}/members`, label: "Members", icon: Users },
  ];

  useEffect(() => {
    const activeTab = rootRef.current?.querySelector<HTMLElement>(
      '[aria-current="page"]',
    );
    activeTab?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "instant",
    });
  }, [pathname]);

  return (
    <div ref={rootRef}>
      <TabScroller aria-label="Project sections">
        {tabs.map((t) => {
          const active =
            t.href === base ? pathname === base : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <MotionTabLink
              key={t.href}
              href={t.href}
              active={active}
              layoutId="project-tab-active"
            >
              <Icon className="size-4 shrink-0" />
              {t.label}
            </MotionTabLink>
          );
        })}
      </TabScroller>
    </div>
  );
}
