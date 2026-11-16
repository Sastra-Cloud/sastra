/** Fixed-position bounds in layout coordinates, constrained above the keyboard. */
export function mentionMenuPosition(
  anchor: { left: number; top: number; bottom: number; width: number },
  viewport: { offsetLeft: number; offsetTop: number; width: number; height: number }
) {
  const edge = 8;
  const gap = 6;
  const maxHeight = 256;
  const leftEdge = viewport.offsetLeft + edge;
  const rightEdge = viewport.offsetLeft + viewport.width - edge;
  const topEdge = viewport.offsetTop + edge;
  const bottomEdge = viewport.offsetTop + viewport.height - edge;
  const width = Math.min(Math.max(anchor.width, 224), Math.max(0, rightEdge - leftEdge));
  const above = Math.max(0, anchor.top - gap - topEdge);
  const below = Math.max(0, bottomEdge - anchor.bottom - gap);
  const flip = below < maxHeight && above > below;
  const top = Math.max(topEdge, Math.min(flip ? anchor.top - gap : anchor.bottom + gap, bottomEdge));

  return {
    left: Math.max(leftEdge, Math.min(anchor.left, rightEdge - width)),
    top,
    width,
    maxHeight: Math.max(0, Math.min(maxHeight, flip ? top - topEdge : bottomEdge - top)),
    flip,
  };
}
