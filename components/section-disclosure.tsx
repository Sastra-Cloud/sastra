"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native disclosure keeps forms mounted and reveals bookmarked or invalid fields. */
export function SectionDisclosure({
  id, title, description, summary, defaultOpen = false, children,
  className, contentClassName, revealFor,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** A changing suggestion/deep-link key reopens its containing section. */
  revealFor?: string | null;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function revealHash() {
      let targetId: string;
      try { targetId = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      const target = targetId ? document.getElementById(targetId) : null;
      if (target && ref.current?.contains(target)) {
        ref.current.open = true;
        // A bookmarked descendant needs layout after all enclosing sections open.
        requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "instant" }));
      }
    }
    revealHash();
    if (revealFor && ref.current) ref.current.open = true;
    window.addEventListener("hashchange", revealHash);
    window.addEventListener("popstate", revealHash);
    const node = ref.current;
    const revealError = () => {
      if (node?.querySelector('[aria-invalid="true"]')) node.open = true;
    };
    revealError();
    const observer = new MutationObserver(revealError);
    if (node) observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-invalid"] });
    return () => {
      window.removeEventListener("hashchange", revealHash);
      window.removeEventListener("popstate", revealHash);
      observer.disconnect();
    };
  }, [id, revealFor]);

  return (
    <details ref={ref} id={id} open={defaultOpen} onInvalidCapture={() => {
      if (ref.current) ref.current.open = true;
    }} className={cn("group/disclosure scroll-mt-32 rounded-xl border bg-card", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}
        </span>
        {summary !== undefined && summary !== null ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{summary}</span> : null}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none group-open/disclosure:rotate-180" />
      </summary>
      <div className={cn("space-y-4 border-t p-4", contentClassName)}>{children}</div>
    </details>
  );
}
