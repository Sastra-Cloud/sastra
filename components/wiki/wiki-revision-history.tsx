"use client";

import { confirmDialog } from "@/lib/dialog-requests";

import { useState, useTransition } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { restoreWikiRevision } from "@/lib/wiki/actions";

export function WikiRevisionHistory({
  pageId,
  revisions,
}: {
  pageId: string;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    title: string;
    summary: string | null;
    publishedBy: string | null;
    createdAt: Date;
  }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  async function restore(revisionId: string) {
    if (!(await confirmDialog("Restore this revision into the current draft? The published page will not change until you publish again."))) return;
    start(async () => {
      const result = await restoreWikiRevision({ pageId, revisionId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Revision restored into the draft");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}><History />History</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Published revisions</SheetTitle>
          <SheetDescription>Restoring creates a new draft. It never rewrites published history.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 overflow-y-auto px-4 pb-6">
          {revisions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">This page has not been published yet.</p>
          ) : revisions.map((revision) => (
            <div key={revision.id} className="grid gap-2 rounded-lg border p-3">
              <div>
                <p className="font-medium">Revision {revision.revisionNumber}</p>
                <p className="text-xs text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</p>
              </div>
              <p className="text-sm text-muted-foreground">{revision.title}</p>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => restore(revision.id)}>
                {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restore to draft
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
