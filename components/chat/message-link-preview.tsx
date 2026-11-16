"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type Preview = { title: string; description: string; hasImage: boolean };

/** Mounted with the message+URL as its key so an edit can never show stale metadata. */
export function MessageLinkPreview({ messageId, url, isOwn }: { messageId: string; url: string; isOwn: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ preview: Preview | null; loading: boolean }>({ preview: null, loading: true });
  const [imageFailed, setImageFailed] = useState(false);
  const endpoint = `/api/chat/messages/${encodeURIComponent(messageId)}/link-preview?url=${encodeURIComponent(url)}`;

  useEffect(() => {
    const controller = new AbortController();
    let started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setState({ preview: data?.preview ?? null, loading: false });
      } catch {
        if (!controller.signal.aborted) setState({ preview: null, loading: false });
      }
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "160px" });
    if (container.current) observer.observe(container.current);
    return () => { controller.abort(); observer.disconnect(); };
  }, [endpoint]);

  const { preview, loading } = state;
  if (!loading && !preview) return null;
  return (
    <div ref={container} className="mt-2 w-80 max-w-full whitespace-normal text-inherit" data-link-preview>
      {loading ? <div role="status" className={cn("flex min-h-20 items-center gap-2 rounded-lg p-3 text-xs", isOwn ? "bg-black/5 dark:bg-black/15" : "bg-muted")}>
        <Globe aria-hidden className="size-4 shrink-0" />Loading link preview…
      </div> : preview ? <a href={url} target="_blank" rel="noopener noreferrer ugc" aria-label={`${preview.title} (opens in a new tab)`}
        className={cn("block overflow-hidden rounded-lg text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current motion-reduce:transition-none", isOwn ? "bg-black/5 hover:bg-black/10 dark:bg-black/15 dark:hover:bg-black/20" : "bg-muted hover:bg-accent")}>
        {preview.hasImage && !imageFailed ? (
          // Same-origin authenticated proxy; no direct requests to external image trackers.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${endpoint}&image=1`} alt="" width={720} height={400} loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="aspect-[1.8] w-full object-cover" />
        ) : null}
        <span className="block min-w-0 space-y-1 p-3">
          <span className="flex items-center gap-1.5 text-xs"><Globe aria-hidden className="size-3 shrink-0" /><span className="truncate">{new URL(url).hostname}</span><ExternalLink aria-hidden className="ml-auto size-3 shrink-0" /></span>
          <span className="line-clamp-2 text-sm font-semibold [overflow-wrap:anywhere]">{preview.title}</span>
          {preview.description ? <span className="line-clamp-2 text-xs leading-relaxed [overflow-wrap:anywhere]">{preview.description}</span> : null}
        </span>
      </a> : null}
    </div>
  );
}
