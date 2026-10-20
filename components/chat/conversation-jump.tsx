"use client";

import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConversationJump({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return visible ? <Button type="button" variant="secondary" size="sm" onClick={onClick} className="absolute bottom-3 left-1/2 z-10 min-h-11 -translate-x-1/2 gap-2 rounded-full border"><ArrowDown className="size-4" />Latest messages</Button> : null;
}
