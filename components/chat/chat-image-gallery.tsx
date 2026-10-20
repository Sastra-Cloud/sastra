"use client";

import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Download, ImageOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { chatMessageImages, type ChatImage } from "@/lib/chat/images";
import type { Attachment } from "@/lib/files/queries";
import { formatBytes } from "@/lib/format";

const ChatImageViewer = lazy(() => import("./chat-image-viewer"));

type Selection = { images: ChatImage[]; index: number; trigger: HTMLElement };

export function ChatImageGallery({ attachments }: { attachments: Attachment[] }) {
  const images = chatMessageImages(attachments);
  const [selection, setSelection] = useState<Selection | null>(null);

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
      {images.map((image, index) => (
        <ImagePreview
          key={image.attachmentId}
          image={image}
          onOpen={(trigger) => setSelection({ images, index, trigger })}
        />
      ))}
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
  onOpen,
}: {
  image: ChatImage;
  onOpen: (trigger: HTMLElement) => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [width, setWidth] = useState(640);

  return (
    <figure
      className="max-w-full min-w-0 shrink-0 self-start overflow-hidden rounded-xl border bg-background/80"
      style={{ width }}
    >
      <button
        data-message-image=""
        type="button"
        aria-label={`View image ${image.name}`}
        aria-haspopup="dialog"
        onClick={(event) => onOpen(event.currentTarget)}
        className="block w-full cursor-zoom-in bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {!previewFailed ? (
          // Authenticated private images keep using the protected file route.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt={image.name}
            loading="lazy"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth && naturalHeight) {
                // Larger screenshots use the conversation width; portrait and
                // small images retain their proportions without being enlarged.
                const scale = Math.min(1, 640 / naturalWidth, 448 / naturalHeight);
                setWidth(naturalWidth * scale);
              }
            }}
            onError={() => setPreviewFailed(true)}
            className="block h-auto max-h-112 w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        ) : (
          <span className="flex min-h-28 items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <ImageOff aria-hidden className="size-5" />
            Open image
          </span>
        )}
      </button>
      <figcaption className="flex min-w-0 items-center gap-2 py-1 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={image.name}>{image.name}</p>
          <p className="text-xs text-muted-foreground">
            {previewFailed ? "Preview unavailable · " : ""}{formatBytes(image.sizeBytes)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          render={<a href={image.downloadUrl} />}
          aria-label={`Download ${image.name}`}
        >
          <Download className="size-4" />
        </Button>
      </figcaption>
    </figure>
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
