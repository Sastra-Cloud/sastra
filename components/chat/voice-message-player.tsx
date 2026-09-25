"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

const WAVEFORM_HEIGHTS = [
  10, 17, 13, 24, 18, 29, 15, 21, 27, 12, 19, 31, 22, 16, 26, 20, 12, 28,
  18, 24, 14, 30, 21, 16, 25, 13, 19, 28, 17, 23, 12, 26, 20, 15,
];
const VOICE_PLAY_EVENT = "sastra:voice-message-play";

function audioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function VoiceMessagePlayer({
  src,
  isOwn,
}: {
  src: string;
  isOwn: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const pauseForAnotherMessage = (event: Event) => {
      const { src: playingSrc } = (event as CustomEvent<{ src: string }>).detail;
      if (playingSrc !== src) audioRef.current?.pause();
    };
    window.addEventListener(VOICE_PLAY_EVENT, pauseForAnotherMessage);
    return () =>
      window.removeEventListener(VOICE_PLAY_EVENT, pauseForAnotherMessage);
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || unavailable) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      window.dispatchEvent(
        new CustomEvent(VOICE_PLAY_EVENT, { detail: { src } })
      );
      await audio.play();
    } catch {
      setUnavailable(true);
    }
  }

  function seek(nextTime: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const progress = duration > 0 ? currentTime / duration : 0;
  const displayedTime = currentTime > 0 ? currentTime : duration;

  return (
    <div
      className={cn(
        "w-[18rem] max-w-full rounded-2xl px-3 py-3",
        isOwn
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border bg-secondary/70 text-secondary-foreground"
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => {
          setDuration(
            Number.isFinite(event.currentTarget.duration)
              ? event.currentTarget.duration
              : 0
          );
          setUnavailable(false);
        }}
        onDurationChange={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) {
            setDuration(event.currentTarget.duration);
          }
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => setUnavailable(true)}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlayback()}
          disabled={unavailable}
          aria-label={playing ? "Pause voice message" : "Play voice message"}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-[background-color,scale] duration-150 ease-out active:not-disabled:scale-95 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-ring/55",
            isOwn
              ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              : "bg-primary text-primary-foreground hover:bg-primary/85"
          )}
        >
          {playing ? (
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
            {WAVEFORM_HEIGHTS.map((height, index) => {
              const played =
                (index + 1) / WAVEFORM_HEIGHTS.length <= progress;
              return (
                <span
                  // The stable index is the waveform sample's identity.
                  key={index}
                  aria-hidden="true"
                  className={cn(
                    "w-[3px] flex-1 rounded-full transition-colors duration-150",
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
              disabled={unavailable || duration === 0}
              onChange={(event) => seek(Number(event.currentTarget.value))}
              aria-label="Seek voice message"
              aria-valuetext={`${audioTime(currentTime)} of ${audioTime(duration)}`}
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>
          <div
            className={cn(
              "mt-0.5 flex items-center justify-between gap-3 text-[0.7rem] tabular-nums",
              isOwn
                ? "text-primary-foreground/75"
                : "text-muted-foreground"
            )}
          >
            <span>{unavailable ? "Audio unavailable" : audioTime(displayedTime)}</span>
            <span className="font-medium">Voice message</span>
          </div>
        </div>
      </div>
    </div>
  );
}
