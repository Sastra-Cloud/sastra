"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Download, Loader2, Pause, Play, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { useVoicePlayer } from "./voice-playback-provider";
import type { VoiceMetadata } from "@/lib/chat/voice-metadata";

const WAVEFORM_HEIGHTS = [
  10, 17, 13, 24, 18, 29, 15, 21, 27, 12, 19, 31, 22, 16, 26, 20, 12, 28,
  18, 24, 14, 30, 21, 16, 25, 13, 19, 28, 17, 23, 12, 26, 20, 15,
];

function audioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function VoiceMessagePlayer({
  id, src, isOwn, metadata,
}: {
  id: string;
  src: string;
  isOwn: boolean;
  metadata?: VoiceMetadata | null;
}) {
  const player = useVoicePlayer();
  const state = useSyncExternalStore(player.subscribe, () => player.snapshot(id), player.serverSnapshot);
  const { currentTime, error } = state;
  const duration = state.duration || (metadata?.durationMs ?? 0) / 1000;
  const playing = state.status === "playing";
  const loading = state.status === "loading";
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const displayedTime = currentTime > 0 ? currentTime : duration;
  const heights = metadata?.peaks?.map(value => Math.max(5, Math.round(value * 31))) ?? WAVEFORM_HEIGHTS;
  useEffect(() => () => player.pause(id), [id, player]);

  return (
    <div
      className={cn(
        "w-[18rem] max-w-full rounded-2xl px-3 py-3",
        isOwn
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border bg-secondary/70 text-secondary-foreground"
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => player.play({ id, src, durationMs: metadata?.durationMs })}
          aria-label={loading ? "Cancel loading voice message" : playing ? "Pause voice message" : error ? "Retry voice message" : "Play voice message"}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 ease-out active:not-disabled:scale-95 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-ring/55",
            isOwn
              ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              : "bg-primary text-primary-foreground hover:bg-primary/85"
          )}
        >
          {loading ? (
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : error ? (
            <RotateCcw aria-hidden className="size-4" />
          ) : playing ? (
            <Pause className="size-4 fill-current" />
          ) : (
            <Play className="ml-0.5 size-4 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "relative flex h-9 items-center gap-[2px] rounded-md outline-none focus-within:ring-2",
              isOwn
                ? "focus-within:ring-primary-foreground/60"
                : "focus-within:ring-ring/55"
            )}
          >
            {heights.map((height, index) => {
              const played =
                (index + 1) / heights.length <= progress;
              return (
                <span
                  // The stable index is the waveform sample's identity.
                  key={index}
                  aria-hidden="true"
                  className={cn(
                    "min-w-0 flex-1 rounded-full transition-colors duration-150",
                    isOwn
                      ? played
                        ? "bg-primary-foreground"
                        : "bg-primary-foreground/32"
                      : played
                        ? "bg-primary"
                        : "bg-muted-foreground/28"
                  )}
                  style={{ height }}
                />
              );
            })}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={loading || !!error || duration === 0 || state.status === "idle"}
              onChange={(event) => player.seek(id, Number(event.currentTarget.value))}
              aria-label="Seek voice message"
              aria-valuetext={`${audioTime(currentTime)} of ${audioTime(duration)}`}
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>
          <div
            className={cn(
              "mt-0.5 flex items-center justify-between gap-1 whitespace-nowrap text-[0.7rem] tabular-nums",
              isOwn
                ? "text-primary-foreground/75"
                : "text-muted-foreground"
            )}
          >
            <span aria-label={duration ? undefined : "Duration loads when you press Play"}>{loading ? "Loading…" : duration ? audioTime(displayedTime) : "—:—"}</span>
            <span className="font-medium">Voice message</span>
          </div>
        </div>
        <button type="button" onClick={() => player.play({ id, src, durationMs: metadata?.durationMs }, true)}
          disabled={state.status === "idle" || loading}
          aria-label="Reload voice message" title="Reload audio if you cannot hear it"
          className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-black/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-current">
          <RotateCcw aria-hidden className="size-4" />
        </button>
      </div>
      {error ? <div role="status" className="mt-2 flex items-start gap-2 text-xs">
        <span className="min-w-0 flex-1">{error}</span>
        <a href={src.replace(/([?&])inline=1(&|$)/, "$1").replace(/[?&]$/, "")} target="_blank" rel="noreferrer"
          aria-label="Download voice message" className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg outline-none hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-current">
          <Download aria-hidden className="size-4" />
        </a>
      </div> : null}
    </div>
  );
}
