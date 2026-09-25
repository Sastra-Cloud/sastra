"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A small, accessible "?" help icon. Click or focus + Enter opens a popover
 * with an explanation — works on touch, mouse, and keyboard alike. Use for
 * non-obvious controls; keep the copy to a sentence or two.
 */
export function HelpTip({
  children,
  title,
  label = "What's this?",
  side = "top",
  align = "center",
  className,
  iconClassName,
}: {
  children: React.ReactNode;
  title?: string;
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              className
            )}
          />
        }
      >
        <HelpCircle className={cn("size-3.5", iconClassName)} />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-64 max-w-xs gap-1.5 text-pretty leading-relaxed"
      >
        {title ? (
          <PopoverTitle className="text-sm">{title}</PopoverTitle>
        ) : null}
        <PopoverDescription className="text-[13px] text-muted-foreground">
          {children}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
