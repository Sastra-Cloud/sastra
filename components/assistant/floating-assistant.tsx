"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";

import {
  getAssistantSnapshot,
  type AssistantSnapshot,
} from "@/lib/assistant/actions";
import {
  ASSISTANT_OPEN_EVENT,
  ASSISTANT_TIP_KEY,
  showAssistantTip,
  type AssistantOpenDetail,
} from "@/lib/assistant/launcher";
import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";
import { useGuidance } from "@/components/guidance/guidance-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useConversationViewport } from "@/hooks/use-conversation-viewport";

/** Pull the project slug out of a /projects/<slug>/... route, if we're on one. */
function projectSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m ? m[1] : null;
}

/** Wait a moment after the page appears so the tip doesn't compete with it. */
const TIP_DELAY_MS = 1200;

/**
 * App-wide floating assistant: a launcher button + slide-in panel that reuses the
 * full AssistantWorkspace, loads its thread on demand, and passes the current
 * project so "create a task for … this book" resolves to the page you're on.
 *
 * New people see a one-time tip beside the launcher (never an overlay tour).
 * Opening the assistant from anywhere retires the tip.
 */
export function FloatingAssistant({
  userName,
  introduced = false,
}: {
  userName: string;
  /** The person has asked the assistant something before. */
  introduced?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The task/budget/print boards carry their scope in `?run=`; forward it so a
  // task the user asks for is filed into the scope they're currently viewing.
  const runScope = searchParams.get("run");
  const [open, setOpen] = useState(false);
  const viewportRef = useConversationViewport<HTMLDivElement>(open, "overlay");
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const refreshId = useRef(0);
  const loadedProjectSlug = useRef<string | null>(null);
  // A prompt seeded from a "Walk me through this" button; `seed` re-prefills the
  // composer even when the same text is sent twice.
  const [seeded, setSeeded] = useState<{ text: string; seed: number } | null>(
    null
  );

  const guidance = useGuidance();
  const showTip = showAssistantTip({
    introduced,
    guidanceEnabled: guidance.enabled,
    isDismissed: guidance.isDismissed,
  });
  const [tipReady, setTipReady] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const tipTitleId = useId();
  const tipBodyId = useId();
  const { dismiss } = guidance;

  const projectSlug = projectSlugFromPath(pathname);
  const isChatConversation = /^\/chat\/[^/]+$/.test(pathname) || /^\/projects\/[^/]+\/chat$/.test(pathname);

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
        // Opening it once (from the launcher, a "Walk me through this" button,
        // or a shortcut) is enough: the person now knows where it is.
        if (showTip) dismiss(ASSISTANT_TIP_KEY);
      }
      setOpen(next);
    },
    [dismiss, projectSlug, refresh, showTip]
  );

  useEffect(() => {
    if (!showTip) return;
    const timer = window.setTimeout(() => setTipReady(true), TIP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [showTip]);

  const hideTip = useCallback(() => {
    const hadFocus = document.activeElement?.closest("[data-assistant-tip]");
    dismiss(ASSISTANT_TIP_KEY);
    // Keep keyboard users in place instead of dropping focus to the page.
    if (hadFocus) launcherRef.current?.focus();
  }, [dismiss]);

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
      {!open && !isChatConversation ? (
        <div data-assistant-launcher className="fixed right-5 bottom-5 z-40 flex flex-col items-end gap-3">
          {showTip && tipReady ? (
            <aside
              data-assistant-tip
              aria-labelledby={tipTitleId}
              aria-describedby={tipBodyId}
              onKeyDown={(event) => {
                if (event.key === "Escape") hideTip();
              }}
              className="relative w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 duration-200 ease-out motion-safe:slide-in-from-bottom-2"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 space-y-1">
                  <p id={tipTitleId} className="font-semibold text-foreground text-pretty">
                    Need help? Ask the assistant
                  </p>
                  <p id={tipBodyId} className="leading-relaxed text-muted-foreground text-pretty">
                    Type or speak a question. It can find your tasks, explain
                    this page, or make changes for you. Nothing is saved until
                    you approve it.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={hideTip}>
                  Hide tip
                </Button>
                <Button type="button" size="sm" onClick={() => handleOpenChange(true)}>
                  Try the assistant
                </Button>
              </div>
              {/* Tail pointing down at the launcher. */}
              <span
                aria-hidden="true"
                className="absolute -bottom-[7px] right-[18px] size-3 rotate-45 border-r border-b bg-popover"
              />
            </aside>
          ) : null}
          <Button
            ref={launcherRef}
            type="button"
            size="icon"
            aria-label="Open assistant"
            aria-describedby={showTip && tipReady ? tipBodyId : undefined}
            title="Assistant"
            onClick={() => handleOpenChange(true)}
            className="size-12 rounded-full shadow-lg transition-[background-color,scale] hover:scale-105 active:scale-95"
          >
            <Sparkles className="size-5" />
          </Button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          ref={viewportRef}
          side="right"
          showCloseButton={false}
          className="conversation-overlay gap-0 p-0 data-[side=right]:w-screen data-[side=right]:max-w-none data-[side=right]:border-l-0 lg:data-[side=right]:w-full lg:data-[side=right]:max-w-[27rem] lg:data-[side=right]:border-l"
        >
          <SheetTitle className="sr-only">Assistant</SheetTitle>
          <div className="flex h-full min-h-0 flex-col lg:p-4">
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
