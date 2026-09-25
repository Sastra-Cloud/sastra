"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin } from "lucide-react";
import { toast } from "sonner";

import { setProjectPinned } from "@/lib/chat/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProjectPinToggle({
  projectId,
  projectTitle,
  pinned,
  className,
}: {
  projectId: string;
  projectTitle: string;
  pinned: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [optimisticPinned, setOptimisticPinned] = useState(pinned);
  const [pending, startTransition] = useTransition();
  const nextPinned = !optimisticPinned;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-pressed={optimisticPinned}
      aria-label={
        optimisticPinned ? `Unpin ${projectTitle}` : `Pin ${projectTitle}`
      }
      title={optimisticPinned ? "Unpin project" : "Pin project"}
      className={cn(
        "size-8 shrink-0 text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
        optimisticPinned && "text-primary",
        className
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOptimisticPinned(nextPinned);
        startTransition(async () => {
          try {
            await setProjectPinned({ projectId, pinned: nextPinned });
            router.refresh();
          } catch (error) {
            setOptimisticPinned(optimisticPinned);
            toast.error((error as Error).message || "Could not update pin.");
          }
        });
      }}
    >
      <Pin className={cn("size-4", !optimisticPinned && "rotate-45")} />
    </Button>
  );
}
