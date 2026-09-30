"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProjectTaskViews({ slug }: { slug: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const run = search.get("run");
  const suffix = run ? `?run=${encodeURIComponent(run)}` : "";
  return <nav aria-label="Project task views" className="flex flex-wrap items-center gap-1 text-sm">
    <span className="mr-2 text-xs text-muted-foreground">Task views</span>
    {[{ label: "Board", href: `/projects/${slug}/tasks` }, { label: "Pipeline", href: `/projects/${slug}/tasks/pipeline` }].map(view => <Link key={view.href} href={`${view.href}${suffix}`} aria-current={pathname === view.href ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-md px-3 font-medium", pathname === view.href ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50")}>{view.label}</Link>)}
  </nav>;
}
