/**
 * Client-side bridge for opening the floating assistant with a prefilled prompt.
 * A page dispatches `openAssistant("…")`; the app-wide FloatingAssistant listens,
 * opens its panel, and drops the text into the composer (it does NOT auto-send,
 * so the user stays in control and can edit or speak the rest).
 */

export const ASSISTANT_OPEN_EVENT = "assistant:open";

export type AssistantOpenDetail = { prompt?: string };

/** Open the floating assistant, optionally with the composer prefilled. */
export function openAssistant(prompt?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AssistantOpenDetail>(ASSISTANT_OPEN_EVENT, {
      detail: { prompt },
    })
  );
}

/** Remembers that the one-time "Ask the assistant" tip is done (hidden or used). */
export const ASSISTANT_TIP_KEY = "assistant:intro";

/**
 * A lone sparkle icon is ambiguous, so new people get a one-time tip beside the
 * launcher. It is coaching, so it respects the guidance switch, and it never
 * shows to someone who has already asked the assistant something.
 */
export function showAssistantTip({
  introduced,
  guidanceEnabled,
  isDismissed,
}: {
  introduced: boolean;
  guidanceEnabled: boolean;
  isDismissed: (key: string) => boolean;
}): boolean {
  return !introduced && guidanceEnabled && !isDismissed(ASSISTANT_TIP_KEY);
}
