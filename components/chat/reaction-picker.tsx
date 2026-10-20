"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DEFAULT_REACTIONS } from "@/lib/chat/reaction-suggestions";

/** Keep the full native emoji dataset and picker out of the initial chat bundle. */
export default function ReactionPicker({ onSelect, frequentEmojis = DEFAULT_REACTIONS, selectedEmojis = [] }: {
  onSelect: (emoji: string) => void; frequentEmojis?: string[]; selectedEmojis?: string[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect);
  const { resolvedTheme } = useTheme();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { callback.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let active = true;
    let element: HTMLElement | undefined;
    Promise.all([import("emoji-mart"), import("@emoji-mart/data")]).then(([{ Picker }, { default: data }]) => {
      if (!active || !host.current) return;
      const picker = new Picker({ data, set: "native", theme: resolvedTheme === "dark" ? "dark" : "light",
        dynamicWidth: true, emojiButtonSize: 44, emojiSize: 26, previewPosition: "none",
        // Our account-based frequent list also includes quick reactions and works across devices.
        skinTonePosition: "search", maxFrequentRows: 0, autoFocus: false,
        onEmojiSelect: (emoji: { native: string }) => callback.current(emoji.native) });
      element = picker as unknown as HTMLElement;
      element.style.width = "100%";
      // Emoji Mart accepts RGB tokens. Resolve our OKLCH theme on the client.
      const canvas = document.createElement("canvas").getContext("2d");
      const styles = getComputedStyle(host.current);
      if (canvas) for (const [token, variable] of [["color", "--foreground"], ["background", "--popover"], ["input", "--muted"], ["accent", "--primary"]]) {
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = styles.getPropertyValue(variable);
        canvas.fillRect(0, 0, 1, 1);
        element.style.setProperty(`--rgb-${token}`, [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3).join(","));
      }
      const overrides = document.createElement("style");
      overrides.textContent = `input{font-size:16px!important} input::placeholder{color:rgb(var(--rgb-color))!important;opacity:.75!important} @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
      element.shadowRoot?.appendChild(overrides);
      host.current.replaceChildren(element);
      setReady(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; element?.remove(); };
  }, [resolvedTheme, attempt]);
  return failed ? <div className="p-4" role="alert"><p className="mb-2 text-sm">Could not load emoji.</p><Button variant="outline" onClick={() => { setFailed(false); setReady(false); setAttempt(value => value + 1); }}>Try again</Button></div>
    : <div className="conversation-emoji-picker relative flex min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 pb-2" role="group" aria-label="Frequent reactions">
        <p className="px-1 pb-1 text-xs text-muted-foreground">Frequently used</p>
        <div className="grid grid-cols-6">{frequentEmojis.slice(0, 6).map(emoji => <button key={emoji} type="button" aria-label={`React ${emoji}`} aria-pressed={selectedEmojis.includes(emoji)} onClick={() => onSelect(emoji)}
          className="flex h-11 min-w-11 items-center justify-center rounded-xl text-2xl hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:bg-muted aria-pressed:bg-primary/15 aria-pressed:ring-1 aria-pressed:ring-primary/50">{emoji}</button>)}</div>
      </div>
      <div ref={host} className="min-h-0 flex-1" />
      {!ready ? <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" role="status">Loading emoji…</p> : null}
    </div>;
}
