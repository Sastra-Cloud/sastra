import { mergeAttributes, Node } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { ReactNodeViewRenderer } from "@tiptap/react";

import {
  WikiExternalEmbedNodeView,
  type WikiExternalEmbedEditHandler,
} from "./wiki-external-embed-node-view";

export const WikiCallout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "note" } };
  },
  parseHTML() {
    return [{ tag: "aside[data-wiki-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-callout": "",
        class: `wiki-callout wiki-callout-${HTMLAttributes.kind ?? "note"}`,
      }),
      0,
    ];
  },
});

export const WikiImageNode = Node.create({
  name: "wikiImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      width: { default: null },
      height: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-wiki-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const mediaId = String(HTMLAttributes.mediaId ?? "");
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-image": "",
        class: "wiki-media-frame",
      }),
      [
        "img",
        {
          src: `/api/wiki/media/${mediaId}/image`,
          alt: String(HTMLAttributes.alt ?? ""),
          class: "wiki-editor-image",
          draggable: "false",
        },
      ],
      HTMLAttributes.caption
        ? ["figcaption", {}, String(HTMLAttributes.caption)]
        : ["figcaption", { class: "sr-only" }, "Image"],
    ];
  },
});

export const WikiVideoNode = Node.create({
  name: "wikiVideo",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { mediaId: { default: null }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-wiki-video]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-video": "",
        class: "wiki-editor-video wiki-media-frame",
      }),
      [
        "div",
        { class: "wiki-editor-media-placeholder", contenteditable: "false" },
        "Private video · upload status appears above",
      ],
      HTMLAttributes.caption
        ? ["figcaption", {}, String(HTMLAttributes.caption)]
        : ["figcaption", { class: "sr-only" }, "Private video"],
    ];
  },
});

export const WikiExternalEmbedNode = Node.create<{
  onEdit: WikiExternalEmbedEditHandler | null;
}>({
  name: "externalEmbed",
  group: "block",
  atom: true,
  draggable: true,
  addOptions() {
    return { onEdit: null };
  },
  addAttributes() {
    return {
      provider: { default: null },
      externalId: { default: null },
      url: { default: null },
      caption: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-wiki-embed]" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(WikiExternalEmbedNodeView);
  },
  renderHTML({ HTMLAttributes }) {
    const provider = String(HTMLAttributes.provider ?? "Embedded video");
    const providerLabel =
      provider === "youtube"
        ? "YouTube"
        : `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-embed": "",
        class: "wiki-editor-embed wiki-media-frame",
      }),
      [
        "div",
        { class: "wiki-editor-media-placeholder", contenteditable: "false" },
        `${providerLabel} embed`,
      ],
      HTMLAttributes.caption
        ? ["figcaption", {}, String(HTMLAttributes.caption)]
        : ["figcaption", { class: "sr-only" }, "Embedded video"],
    ];
  },
});

export function createWikiEditorExtensions(
  onEditEmbed: WikiExternalEmbedEditHandler | null = null
) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
      },
    }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading"
          ? "Section heading"
          : "Write the next clear step…",
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    WikiCallout,
    WikiImageNode,
    WikiVideoNode,
    WikiExternalEmbedNode.configure({ onEdit: onEditEmbed }),
  ];
}

export const wikiEditorExtensions = createWikiEditorExtensions();
