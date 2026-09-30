"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, BookOpenText } from "lucide-react";
import { TabScroller } from "@/components/cockpit";
import { MotionTabLink } from "@/components/motion/tab-link";
import { navigationIcons } from "@/components/navigation-icons";
import { projectNavigation, navigationItemActive, type NavigationItem } from "@/lib/navigation";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function ProjectTabs({ slug, kind }: { slug: string; kind?: string | null }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const sections = projectNavigation(slug, kind);
  const publishing = sections.publishing.find(item => navigationItemActive(pathname, item));
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
        <DropdownMenu>
          <DropdownMenuTrigger aria-current={publishing ? "page" : undefined} className={cn("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", publishing ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground")}>
            <BookOpenText className="size-4" />Publishing<ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-44">
            {sections.publishing.map(item => {
              const Icon = navigationIcons[item.icon];
              return <DropdownMenuItem key={item.href} nativeButton={false} render={<Link href={item.href} />} className="min-h-11 gap-2" aria-current={publishing?.href === item.href ? "page" : undefined}><Icon className="size-4" />{item.label}</DropdownMenuItem>;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {tab(sections.members)}
      </TabScroller>
      {publishing ? <nav aria-label="Publishing sections" className="flex flex-wrap items-center gap-1 border-b pb-2">
        <span className="mr-2 text-xs text-muted-foreground">Publishing</span>
        {sections.publishing.map(item => <Link key={item.href} href={item.href} aria-current={publishing.href === item.href ? "page" : undefined} className={cn("inline-flex min-h-10 items-center rounded-md px-3 text-sm hover:bg-muted", publishing.href === item.href ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground")}>{item.label}</Link>)}
      </nav> : null}
    </div>
  );
}
