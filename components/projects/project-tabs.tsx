"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { TabScroller } from "@/components/cockpit";
import { MotionTabLink } from "@/components/motion/tab-link";
import { navigationIcons } from "@/components/navigation-icons";
import { projectNavigation, navigationItemActive, type NavigationItem } from "@/lib/navigation";

export function ProjectTabs({ slug, kind, lectioEnabled = false }: { slug: string; kind?: string | null; lectioEnabled?: boolean }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const sections = projectNavigation(slug, kind);
  useEffect(() => {
    const active = rootRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const scroller = active?.closest<HTMLElement>("[data-tab-scroller]");
    if (active && scroller) scroller.scrollTo({ left: active.offsetLeft - scroller.clientWidth / 2 + active.clientWidth / 2, behavior: "instant" });
  }, [pathname]);
  const tab = (item: NavigationItem) => {
    const Icon = navigationIcons[item.icon];
    return <MotionTabLink key={item.href} href={item.href}
      active={item.href === `/projects/${slug}` ? pathname === item.href : navigationItemActive(pathname, item)}
      layoutId="project-tab-active"><Icon className="size-4 shrink-0" />{item.label}</MotionTabLink>;
  };
  return (
    <div ref={rootRef} className="space-y-2">
      <TabScroller aria-label="Project sections">
        {sections.daily.map(tab)}
        {lectioEnabled ? tab({ href: `/projects/${slug}/translation`, label: "Translation", icon: "projects" }) : null}
        {sections.publishing.map(tab)}
        {tab(sections.members)}
      </TabScroller>
    </div>
  );
}
