"use client";

import { useId, useState } from "react";
import { Download, Loader2, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileLink } from "@/components/files/file-link";
import { formatBytes } from "@/lib/format";
import type { ChatVideoQuality } from "@/lib/chat/video";

export type ChatAttachmentProgress = {
  phase: "preparing" | "uploading" | "finishing";
  fileName: string;
  progress: number | null;
  height?: number;
};

export function ChatVideoQualityControl({ quality, disabled, onChange }: {
  quality: ChatVideoQuality; disabled: boolean; onChange: (quality: ChatVideoQuality) => void;
}) {
  const id = useId();
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    <label htmlFor={id} className="font-medium">Video quality</label>
    <select id={id} value={quality} disabled={disabled}
      onChange={event => onChange(event.target.value as ChatVideoQuality)}
      className="min-h-11 max-w-full rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
      <option value="standard">Standard · smaller file</option>
      <option value="high">Higher quality · clearer text</option>
      <option value="original">Original · up to 50 MB</option>
    </select>
    <p className="basis-full text-muted-foreground">
      {quality === "original" ? "Sends the original MP4 or MOV file. Some devices may need to download it."
        : "Video is made smaller on your device after Send. Keep this tab open."}
    </p>
  </div>;
}

export function ChatFileProgress({ value, onCancel }: { value: ChatAttachmentProgress; onCancel: () => void }) {
  const label = value.phase === "preparing" ? "Preparing video" : value.phase === "uploading" ? "Uploading" : "Finishing upload";
  const percent = value.progress === null ? null : Math.floor(value.progress * 100);
  return <div className="space-y-1.5" data-chat-file-progress={value.phase}>
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
      <span role="status" className="min-w-0 flex-1 truncate">{label}: {value.fileName}</span>
      <span aria-hidden className="shrink-0 text-muted-foreground tabular-nums">
        {value.height ? `${value.height}p · ` : ""}{percent === null ? "" : `${percent}%`}
      </span>
      {value.phase === "preparing" ? <Button type="button" variant="ghost" size="sm"
        className="min-h-11 shrink-0" onClick={onCancel}>Cancel preparation</Button> : null}
    </div>
    {value.progress !== null ? <progress max={1} value={value.progress} aria-label={`${label}: ${value.fileName}`}
      className="block h-1.5 w-full overflow-hidden rounded-full accent-primary" /> : null}
  </div>;
}

/** Authenticated redirects preserve the conversation's existing file permissions. */
export function ChatVideoPlayer({ fileId, name, sizeBytes }: { fileId: string; name: string; sizeBytes: number }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const url = `/api/files/${fileId}/download`;
  return <figure className="w-96 max-w-full overflow-hidden rounded-xl border bg-background text-foreground">
    {failed ? <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 py-5 text-center text-sm">
      <VideoOff aria-hidden className="size-6 text-muted-foreground" />
      <p>This video could not play. Reload it or download a copy.</p>
      <Button type="button" variant="outline" size="sm" className="min-h-11"
        onClick={() => { setAttempt(current => current + 1); setFailed(false); }}>Reload video</Button>
    </div> : (
      // User-uploaded videos may have no caption track; the message can provide a written description.
      <video key={attempt} controls playsInline preload="metadata" aria-label={name}
        src={`${url}?inline=1&attempt=${attempt}`} onError={() => setFailed(true)}
        className="max-h-80 w-full bg-black object-contain" />
    )}
    <figcaption className="flex min-w-0 items-center gap-2 px-3 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium" title={name}>{name}</span>
        <span className="block text-[11px] text-muted-foreground">{formatBytes(sizeBytes)}</span>
      </span>
      <FileLink href={url} aria-label={`Download ${name}`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <Download aria-hidden className="size-4" />
      </FileLink>
    </figcaption>
  </figure>;
}
