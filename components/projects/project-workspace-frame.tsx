"use client";
import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
export function ProjectWorkspaceFrame({ children }: { children: React.ReactNode }) {
  const chat = usePathname().endsWith("/chat");
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!chat) return;
    const element = ref.current;
    const update = () => {
      if (element) element.style.height = `${Math.max(260, (window.visualViewport?.height ?? window.innerHeight) - element.getBoundingClientRect().top - 16)}px`;
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => { window.removeEventListener("resize", update); window.visualViewport?.removeEventListener("resize", update); if (element) element.style.height = ""; };
  }, [chat]);
  return <div ref={ref} data-chat-conversation={chat ? "" : undefined} className={cn("w-full min-w-0", chat ? "project-chat-frame flex min-h-0 flex-col gap-2 [&>section]:shrink-0 [&>.project-extra]:hidden [&>.project-content]:flex [&>.project-content]:min-h-0 [&>.project-content]:flex-1" : "space-y-4")}>{children}</div>;
}
