"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";

import {
  getAssistantSnapshot,
  type AssistantSnapshot,
} from "@/lib/assistant/actions";
import {
  ASSISTANT_OPEN_EVENT,
  type AssistantOpenDetail,
} from "@/lib/assistant/launcher";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Pull the project slug out of a /projects/<slug>/... route, if we're on one. */
function projectSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m ? m[1] : null;
}

/**
 * App-wide floating assistant: a launcher button + slide-in panel that reuses the
 * full AssistantWorkspace, loads its thread on demand, and passes the current
 * project so "create a task for … this book" resolves to the page you're on.
 */
export function FloatingAssistant({ userName }: { userName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The task/budget/print boards carry their scope in `?run=`; forward it so a
  // task the user asks for is filed into the scope they're currently viewing.
  const runScope = searchParams.get("run");
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshId = useRef(0);
  const loadedProjectSlug = useRef<string | null>(null);
  // A prompt seeded from a "Walk me through this" button; `seed` re-prefills the
  // composer even when the same text is sent twice.
  const [seeded, setSeeded] = useState<{ text: string; seed: number } | null>(
    null
  );

  const projectSlug = projectSlugFromPath(pathname);
  const isChatConversation = /^\/chat\/[^/]+$/.test(pathname);

  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current;
    setLoading(true);
    try {
      const next = await getAssistantSnapshot(projectSlug ?? undefined);
      if (requestId === refreshId.current) setSnapshot(next);
    } finally {
      if (requestId === refreshId.current) setLoading(false);
    }
  }, [projectSlug]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        loadedProjectSlug.current = projectSlug;
        void refresh();
      }
      setOpen(next);
    },
    [projectSlug, refresh]
  );

  // Open (and prefill) when a page fires openAssistant(prompt).
  useEffect(() => {
    let counter = 0;
    const onOpen = (event: Event) => {
      const prompt = (event as CustomEvent<AssistantOpenDetail>).detail?.prompt;
      if (prompt) setSeeded({ text: prompt, seed: ++counter });
      handleOpenChange(true);
    };
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpen);
  }, [handleOpenChange]);

  useEffect(() => {
    if (!open || loadedProjectSlug.current === projectSlug) return;
    loadedProjectSlug.current = projectSlug;
    const frame = window.requestAnimationFrame(() => void refresh());
    return () => window.cancelAnimationFrame(frame);
  }, [open, projectSlug, refresh]);

  // The dedicated page already contains the full workspace and composer. A
  // second fixed launcher obscures its mobile send button and serves no purpose.
  if (pathname === "/assistant") return null;

  return (
    <>
      {!open ? (
        <Button
          type="button"
          size="icon"
          aria-label="Open assistant"
          title="Assistant"
          onClick={() => handleOpenChange(true)}
          className={cn(
            "fixed right-5 z-40 size-12 rounded-full shadow-lg transition-[bottom,scale] hover:scale-105 active:scale-95",
            isChatConversation
              ? "bottom-[calc(6.5rem+env(safe-area-inset-bottom))]"
              : "bottom-5"
          )}
        >
          <Sparkles className="size-5" />
        </Button>
      ) : null}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="h-[100dvh] gap-0 p-0 data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:border-l-0 sm:data-[side=right]:w-full sm:data-[side=right]:max-w-[27rem] sm:data-[side=right]:border-l"
        >
          <SheetTitle className="sr-only">Assistant</SheetTitle>
          <div className="flex h-full min-h-0 flex-col px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
            {snapshot ? (
              <AssistantWorkspace
                variant="embedded"
                userName={userName}
                messages={snapshot.messages}
                pending={snapshot.pending}
                budget={snapshot.budget}
                projectSlug={projectSlug}
                projectTitle={
                  snapshot.contextProject?.slug === projectSlug
                    ? snapshot.contextProject.title
                    : null
                }
                runScope={runScope}
                initialComposerText={seeded?.text}
                composerSeed={seeded?.seed}
                onAfterAction={refresh}
                onClose={() => handleOpenChange(false)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading…" : null}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
