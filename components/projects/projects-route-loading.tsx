"use client";

import { usePathname } from "next/navigation";

import {
  ProjectsSkeleton,
  ProjectWorkspaceSkeleton,
} from "@/components/page-skeleton";

export function ProjectsRouteLoading() {
  const pathname = usePathname();
  const match = pathname.match(/^\/projects\/([^/]+)/);

  if (!match) return <ProjectsSkeleton />;
  return <ProjectWorkspaceSkeleton slug={decodeURIComponent(match[1])} />;
}
