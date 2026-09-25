"use client";

import { useEffect, useState } from "react";
import { Loader2, VideoOff } from "lucide-react";

export function WikiPrivateVideo({ mediaId }: { mediaId: string }) {
  const [state, setState] = useState<
    | { status: "loading" }
    | {
        status: "r2";
        videoUrl: string;
        posterUrl: string;
        captionUrl: string | null;
        spokenLanguage: string | null;
      }
    | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/wiki/media/${mediaId}/video-token`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Video unavailable");
        return (await response.json()) as {
          videoUrl: string;
          posterUrl: string;
          captionUrl: string | null;
          spokenLanguage: string | null;
        };
      })
      .then((result) => setState({ status: "r2", ...result }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [mediaId]);

  if (state.status === "loading") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground ring-1 ring-border">
        <Loader2 className="mr-2 size-4 animate-spin" /> Preparing private video…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl bg-muted px-6 text-center text-sm text-muted-foreground ring-1 ring-border">
        <VideoOff className="size-6" />
        This private video is not available right now.
      </div>
    );
  }
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border">
      <video
        controls
        playsInline
        preload="metadata"
        poster={state.posterUrl}
        className="size-full bg-black object-contain"
      >
        <source src={state.videoUrl} type="video/mp4" />
        {state.captionUrl ? (
          <track
            default
            kind="captions"
            src={state.captionUrl}
            srcLang={state.spokenLanguage ?? "en"}
            label="Captions"
          />
        ) : null}
        Your browser does not support private MP4 playback.
      </video>
    </div>
  );
}
