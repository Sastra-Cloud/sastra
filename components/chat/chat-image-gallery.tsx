"use client";

import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chatMessageImages, type ChatImage } from "@/lib/chat/images";
import type { Attachment } from "@/lib/files/queries";
import { cn } from "@/lib/utils";

const ChatImageViewer = lazy(() => import("./chat-image-viewer"));

type Selection = { images: ChatImage[]; index: number; trigger: HTMLElement };

export function ChatImageGallery({ attachments }: { attachments: Attachment[] }) {
  const images = chatMessageImages(attachments);
  const [selection, setSelection] = useState<Selection | null>(null);
  const grouped = images.length > 1;
  const visibleImages = images.slice(0, 4);

  function closeViewer() {
    const trigger = selection?.trigger;
    setSelection(null);
    // Safari does not always focus a button on pointer click. Always return to
    // the actual invoker, or to the composer if polling removed that message.
    const target = trigger?.isConnected
      ? trigger
      : document.querySelector<HTMLTextAreaElement>("[data-chat-composer] textarea");
    target?.focus({ preventScroll: true });
  }

  return (
    <>
      <div
        role={grouped ? "group" : undefined}
        aria-label={grouped ? `${images.length} images` : undefined}
        className={cn("max-w-full overflow-hidden rounded-lg", grouped && "grid w-112 grid-cols-2 gap-1")}
      >
        {visibleImages.map((image, index) => (
          <ImagePreview
            key={image.attachmentId}
            image={image}
            grouped={grouped}
            featured={images.length === 3 && index === 0}
            remaining={index === 3 ? images.length - visibleImages.length : 0}
            onOpen={(trigger) => setSelection({ images, index, trigger })}
          />
        ))}
      </div>
      {selection ? (
        <ViewerErrorBoundary
          fallback={<ViewerNotice failed image={selection.images[selection.index]} onClose={closeViewer} />}
        >
          <Suspense fallback={<ViewerNotice onClose={closeViewer} />}>
            <ChatImageViewer
              images={selection.images}
              initialIndex={selection.index}
              onClose={closeViewer}
            />
          </Suspense>
        </ViewerErrorBoundary>
      ) : null}
    </>
  );
}

function ImagePreview({
  image,
  grouped,
  featured,
  remaining,
  onOpen,
}: {
  image: ChatImage;
  grouped: boolean;
  featured: boolean;
  remaining: number;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);

  return (
    <button
      data-message-image=""
      type="button"
      aria-label={`View image ${image.name}${remaining ? `, ${remaining} more ${remaining === 1 ? "image" : "images"}` : ""}`}
      aria-haspopup="dialog"
      onClick={(event) => onOpen(event.currentTarget)}
      className={cn(
        "relative block max-w-full min-w-0 cursor-zoom-in overflow-hidden bg-background/80 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        grouped ? "aspect-square w-full" : "aspect-[10/7] w-160",
        featured && "col-span-2 aspect-[2/1]"
      )}
    >
      {!previewFailed ? (
        // Authenticated private images keep using the protected file route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          alt={image.name}
          loading="lazy"
          decoding="async"
          onError={() => setPreviewFailed(true)}
          className={cn(
            // Reserve the preview frame before private media loads. Its natural
            // dimensions must not resize the bubble and move the whole thread.
            "absolute inset-0 size-full outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10",
            grouped ? "object-cover" : "object-contain"
          )}
        />
      ) : (
        <span className="flex min-h-28 h-full flex-col items-center justify-center gap-2 p-3 text-sm text-foreground">
          <ImageOff aria-hidden className="size-5 shrink-0" />
          <span className="line-clamp-2 max-w-full break-all">{image.name}</span>
          <span className="text-xs">Open image</span>
        </span>
      )}
      {remaining > 0 ? <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/60 text-2xl font-semibold text-white">+{remaining}</span> : null}
    </button>
  );
}

function ViewerNotice({ failed, image, onClose }: {
  failed?: boolean;
  image?: ChatImage;
  onClose: () => void;
}) {
  return (
    <div
      role={failed ? "alert" : "status"}
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-70 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-md"
    >
      {!failed ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
      <span>{failed ? "Couldn't open the viewer. Reload this page or open the original." : "Opening image…"}</span>
      {failed && image ? (
        <Button variant="outline" render={<a href={image.src} target="_blank" rel="noreferrer" />}>
          Open original
        </Button>
      ) : null}
      <Button variant="ghost" onClick={onClose}>{failed ? "Dismiss" : "Cancel"}</Button>
    </div>
  );
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
