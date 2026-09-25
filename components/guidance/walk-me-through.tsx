"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openAssistant } from "@/lib/assistant/launcher";

/**
 * Opens the assistant with a page-aware prompt already in the composer, so a
 * user who is unsure what to do next can get step-by-step help in plain words.
 * It does not send automatically — the user reviews or edits first. The
 * assistant already knows which project the page is about.
 */
export function WalkMeThrough({
  prompt,
  label = "Walk me through this",
  variant = "outline",
  size = "sm",
  className,
}: {
  prompt: string;
  label?: string;
  variant?: "outline" | "ghost" | "secondary" | "default";
  size?: "xs" | "sm" | "default";
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => openAssistant(prompt)}
    >
      <Sparkles className="size-4" />
      {label}
    </Button>
  );
}
