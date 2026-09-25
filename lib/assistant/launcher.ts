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
