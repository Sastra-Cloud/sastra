"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { completeProject } from "@/lib/projects/actions";
import { Button } from "@/components/ui/button";

export function CompleteProjectButton({
  projectId,
  className,
}: {
  projectId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [complete, setComplete] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      disabled={pending || complete}
      onClick={() =>
        start(async () => {
          setComplete(true);
          try {
            const res = await completeProject(projectId);
            if (res.error) throw new Error(res.error);
            if (res.invoiceTasks && res.invoiceTasks > 0) {
              toast.success(
                `Project complete. ${res.invoiceTasks} final invoice task${
                  res.invoiceTasks === 1 ? "" : "s"
                } assigned.`
              );
            }
            router.refresh();
          } catch (error) {
            setComplete(false);
            toast.error(error instanceof Error ? error.message : "Could not complete the project.");
          }
        })
      }
    >
      <CheckCircle2 className="size-4" />
      {complete ? "Project complete" : "Mark complete"}
    </Button>
  );
}
