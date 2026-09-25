"use client";

import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { restoreWikiPage } from "@/lib/wiki/actions";

type TrashedPage = { id: string; title: string; subjectTitle: string; deletedAt: Date | null };

export function WikiTrash({ pages }: { pages: TrashedPage[] }) {
  const router = useRouter();
  const restoration = useOptimisticAction<TrashedPage[], string>({
    state: pages,
    update: (current, pageId) => current.filter((page) => page.id !== pageId),
    getKey: (pageId) => pageId,
  });

  function restore(pageId: string) {
    restoration.run(pageId, () => restoreWikiPage(pageId), {
      onSuccess: () => {
        toast.success("Wiki page restored");
        router.refresh();
      },
    });
  }

  if (restoration.state.length === 0) return <div className="rounded-xl border border-dashed bg-card px-6 py-16 text-center"><Trash2 className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-heading text-xl font-semibold">Trash is empty</h2><p className="mt-1 text-sm text-muted-foreground">Deleted wiki pages will appear here for recovery.</p></div>;

  return <div className="divide-y rounded-xl border bg-card px-4">{restoration.state.map((page) => <div key={page.id} className="flex min-h-20 flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-medium">{page.title}</p><p className="text-sm text-muted-foreground">{page.subjectTitle}{page.deletedAt ? ` · Deleted ${new Date(page.deletedAt).toLocaleDateString()}` : ""}</p></div><Button variant="outline" disabled={restoration.isPending(page.id)} onClick={() => restore(page.id)}>{restoration.isPending(page.id) ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restore</Button></div>)}</div>;
}
