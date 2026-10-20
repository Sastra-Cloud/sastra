"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import Lightbox, { useMotionPreference } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

import type { ChatImage } from "@/lib/chat/images";
import styles from "./chat-image-viewer.module.css";

function containTabFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;

  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
  )].filter((element) => element.tabIndex >= 0 && !element.closest("[inert]") && element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  const active = event.currentTarget.ownerDocument.activeElement;
  const target = event.shiftKey
    ? (active === first || !controls.includes(active as HTMLElement) ? last : null)
    : (active === last || !controls.includes(active as HTMLElement) ? first : null);

  if (target) {
    event.preventDefault();
    target.focus();
  }
}

export default function ChatImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: ChatImage[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(initialIndex);
  const titleId = useId();
  const hintId = useId();
  const reducedMotion = useMotionPreference();
  const image = images[index];
  const slides = useMemo(
    () => images.map((item) => ({ src: item.src, alt: item.name })),
    [images]
  );

  return (
    <Lightbox
      open={open}
      close={() => setOpen(false)}
      index={index}
      slides={slides}
      plugins={[Zoom]}
      className={styles.viewer}
      labels={{
        Lightbox: "Image viewer",
        "Photo gallery": "Images in this message",
        Close: "Close image viewer",
        Previous: "Previous image",
        Next: "Next image",
      }}
      portal={{ container: {
        "aria-labelledby": titleId,
        "aria-describedby": hintId,
        onKeyDownCapture: containTabFocus,
      } }}
      carousel={{ finite: true, preload: 1, padding: 8, spacing: 24, imageFit: "contain" }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      zoom={{ maxZoomPixelRatio: 2, scrollToZoom: true }}
      animation={{
        fade: reducedMotion ? 0 : 150,
        swipe: reducedMotion ? 0 : 200,
        zoom: reducedMotion ? 0 : 180,
      }}
      on={{ view: ({ index: nextIndex }) => setIndex(nextIndex), exited: onClose }}
      toolbar={{ buttons: [
        <a key="download" href={image.downloadUrl} className="yarl__button" aria-label="Download image" title="Download image">
          <Download aria-hidden className="size-6" />
        </a>,
        "close",
      ] }}
      render={{
        iconClose: () => <X aria-hidden className="size-6" />,
        iconPrev: () => <ChevronLeft aria-hidden className="size-6" />,
        iconNext: () => <ChevronRight aria-hidden className="size-6" />,
        iconZoomIn: () => <ZoomIn aria-hidden className="size-6" />,
        iconZoomOut: () => <ZoomOut aria-hidden className="size-6" />,
        iconLoading: () => (
          <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-5 animate-spin motion-reduce:animate-none" />
            Loading image…
          </span>
        ),
        iconError: () => (
          <span role="alert" className="flex max-w-xs flex-col items-center gap-3 px-4 text-center text-sm text-foreground">
            <span>Couldn't load this image.</span>
            <a className="min-h-11 content-center rounded-lg px-3 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={image.src} target="_blank" rel="noreferrer">
              Open original image
            </a>
          </span>
        ),
        ...(images.length === 1 ? { buttonPrev: () => null, buttonNext: () => null } : {}),
        controls: () => (
          <>
            <div className={styles.heading}>
              <p id={titleId} className="truncate text-sm font-medium">Image viewer</p>
            </div>
            <div className={styles.caption}>
              <p className="line-clamp-2 break-all text-sm font-medium" title={image.name}>{image.name}</p>
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                {images.length > 1 ? <span className="shrink-0 tabular-nums">{index + 1} of {images.length}</span> : null}
                <p id={hintId}>
                  <span className="[@media(pointer:fine)]:hidden">Pinch or double-tap to zoom.</span>
                  <span className="hidden [@media(pointer:fine)]:inline">Scroll or double-click to zoom.</span>
                </p>
              </div>
            </div>
          </>
        ),
      }}
    />
  );
}
