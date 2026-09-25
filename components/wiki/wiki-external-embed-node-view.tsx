"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Pencil, SquarePlay } from "lucide-react";

import { Button } from "@/components/ui/button";

export type WikiExternalEmbedAttrs = {
  provider?: string | null;
  externalId?: string | null;
  url?: string | null;
  caption?: string | null;
};

export type WikiExternalEmbedEditHandler = (request: {
  position: number;
  attrs: WikiExternalEmbedAttrs;
}) => void;

type WikiExternalEmbedOptions = {
  onEdit?: WikiExternalEmbedEditHandler | null;
};

export function WikiExternalEmbedNodeView({
  extension,
  getPos,
  node,
}: ReactNodeViewProps) {
  const attrs = node.attrs as WikiExternalEmbedAttrs;
  const provider = String(attrs.provider ?? "video");
  const providerLabel =
    provider === "youtube"
      ? "YouTube"
      : `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
  const onEdit = (extension.options as WikiExternalEmbedOptions).onEdit;

  function editEmbed() {
    const position = getPos();
    if (typeof position !== "number" || !onEdit) return;
    onEdit({ position, attrs });
  }

  return (
    <NodeViewWrapper
      as="figure"
      className="wiki-editor-embed wiki-media-frame"
      data-wiki-embed=""
    >
      <div className="wiki-editor-media-placeholder wiki-editor-embed-placeholder">
        <div className="wiki-editor-embed-summary">
          <SquarePlay aria-hidden="true" />
          <div>
            <p className="wiki-editor-embed-provider">{providerLabel} tutorial</p>
            <p className="wiki-editor-embed-hint">External video embed</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          contentEditable={false}
          aria-label={`Edit ${providerLabel} embed`}
          onClick={editEmbed}
        >
          <Pencil />
          Edit embed
        </Button>
      </div>
      {attrs.caption ? (
        <figcaption>{attrs.caption}</figcaption>
      ) : (
        <figcaption className="sr-only">Embedded video</figcaption>
      )}
    </NodeViewWrapper>
  );
}
