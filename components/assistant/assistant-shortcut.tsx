"use client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openAssistant } from "@/lib/assistant/launcher";
export function AssistantShortcut() {
  return <Button type="button" variant="ghost" size="icon" aria-label="Open assistant" title="Open assistant" onClick={() => openAssistant()}><Sparkles className="size-4" /></Button>;
}
