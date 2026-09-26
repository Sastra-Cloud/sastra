"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
export function TeamPlanningNav() {
  const pathname = usePathname();
  return <nav aria-label="Team planning" className="flex flex-wrap gap-2">
    {[ ["/overview", "Overview"], ["/schedule", "Schedule"], ["/workload", "Workload"] ].map(([href, label]) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={buttonVariants({ variant: active ? "default" : "outline", size: "sm" })}>{label}</Link>;
    })}
  </nav>;
}
