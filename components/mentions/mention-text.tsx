import { Fragment } from "react";

import { tokenizeMentions, type MentionUser } from "@/lib/mentions/parse";
import { cn } from "@/lib/utils";

/**
 * Renders stored comment/message text with @mentions highlighted. Pure and
 * inline — drop it in wherever the raw string was rendered (keep the parent's
 * `whitespace-pre-wrap`). The current user's own mention gets a stronger tint.
 */
export function MentionText({
  text,
  members,
  currentUserId,
  tone = "default",
  className,
}: {
  text: string;
  members: MentionUser[];
  currentUserId?: string | null;
  /** "onPrimary" for mentions sitting on a primary-colored surface (own chat bubble). */
  tone?: "default" | "onPrimary";
  className?: string;
}) {
  const segments = tokenizeMentions(text, members);
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return <Fragment key={i}>{segment.text}</Fragment>;
        }
        const isSelf = !!currentUserId && segment.user.id === currentUserId;
        return (
          <span
            key={i}
            className={cn(
              "rounded px-1 font-medium",
              tone === "onPrimary"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : isSelf
                  ? "bg-primary/20 text-primary"
                  : "bg-primary/10 text-primary",
              className
            )}
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
