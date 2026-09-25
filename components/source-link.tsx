import { Code2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * AGPL source link: points at the exact code this installation runs. Rendered
 * in the app sidebar and on the sign-in screen so it is reachable by everyone
 * who uses the software over the network.
 */
export function SourceLink({
  href,
  version,
  compact = false,
  className,
}: {
  href: string;
  version: string | null;
  compact?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={version ? `Source code for Sastra ${version}` : "Source code for Sastra"}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        compact && "justify-center",
        className
      )}
    >
      <Code2 className="size-3.5 shrink-0" aria-hidden="true" />
      <span className={cn(compact && "sr-only")}>
        Source{version ? ` · ${version}` : ""}
      </span>
    </a>
  );
}
