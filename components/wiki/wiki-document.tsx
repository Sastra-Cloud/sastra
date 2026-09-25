import type { ReactNode } from "react";
import {
  AlertTriangle,
  Info,
  Lightbulb,
} from "lucide-react";

import type { WikiContentNode, WikiDocument } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { WikiPrivateVideo } from "./wiki-private-video";

function nodeText(node: WikiContentNode): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodeText).join("");
}

function headingId(label: string, occurrences: Map<string, number>) {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section";
  const occurrence = occurrences.get(base) ?? 0;
  occurrences.set(base, occurrence + 1);
  return occurrence === 0 ? base : `${base}-${occurrence + 1}`;
}

function markedText(node: WikiContentNode, key: string): ReactNode {
  let content: ReactNode = node.text ?? "";
  for (const [index, mark] of (node.marks ?? []).entries()) {
    const markKey = `${key}-mark-${index}`;
    if (mark.type === "bold") content = <strong key={markKey}>{content}</strong>;
    if (mark.type === "italic") content = <em key={markKey}>{content}</em>;
    if (mark.type === "strike") content = <s key={markKey}>{content}</s>;
    if (mark.type === "code") content = <code key={markKey}>{content}</code>;
    if (mark.type === "link") {
      const href = String(mark.attrs?.href ?? "#");
      content = (
        <a
          key={markKey}
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
        >
          {content}
        </a>
      );
    }
  }
  return content;
}

function ExternalEmbed({ node }: { node: WikiContentNode }) {
  const provider = String(node.attrs?.provider ?? "");
  const externalId = String(node.attrs?.externalId ?? "");
  let src: string | null = null;
  let title = "Embedded tutorial";
  if (provider === "youtube") {
    src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}`;
    title = "YouTube video";
  } else if (provider === "vimeo") {
    src = `https://player.vimeo.com/video/${encodeURIComponent(externalId)}?dnt=1`;
    title = "Vimeo video";
  } else if (provider === "loom") {
    src = `https://www.loom.com/embed/${encodeURIComponent(externalId)}`;
    title = "Loom recording";
  }
  if (!src) return null;
  return (
    <figure className="wiki-media-frame">
      <div className="aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border">
        <iframe
          src={src}
          title={title}
          className="size-full"
          loading="lazy"
          allow="fullscreen; picture-in-picture; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      {node.attrs?.caption ? (
        <figcaption>{String(node.attrs.caption)}</figcaption>
      ) : null}
    </figure>
  );
}

function renderNode(
  node: WikiContentNode,
  key: string,
  headings: Map<string, number>
): ReactNode {
  const children = (node.content ?? []).map((child, index) =>
    renderNode(child, `${key}-${index}`, headings)
  );
  switch (node.type) {
    case "text":
      return markedText(node, key);
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const label = nodeText(node);
      const id = headingId(label, headings);
      return node.attrs?.level === 3 ? (
        <h3 key={key} id={id}>{children}</h3>
      ) : (
        <h2 key={key} id={id}>{children}</h2>
      );
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key} start={Number(node.attrs?.start ?? 1)}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "taskList":
      return <ul key={key} className="wiki-task-list">{children}</ul>;
    case "taskItem":
      return (
        <li key={key} className="wiki-task-item">
          <input
            type="checkbox"
            checked={Boolean(node.attrs?.checked)}
            readOnly
            aria-label="Tutorial checklist item"
          />
          <div>{children}</div>
        </li>
      );
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return <pre key={key}><code>{nodeText(node)}</code></pre>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "callout": {
      const kind = String(node.attrs?.kind ?? "note");
      const Icon = kind === "tip" ? Lightbulb : kind === "warning" ? AlertTriangle : Info;
      return (
        <aside key={key} className={cn("wiki-callout", `wiki-callout-${kind}`)}>
          <Icon aria-hidden className="mt-1 size-5 shrink-0" />
          <div>{children}</div>
        </aside>
      );
    }
    case "wikiImage": {
      const mediaId = String(node.attrs?.mediaId ?? "");
      const width = typeof node.attrs?.width === "number" ? node.attrs.width : undefined;
      const height = typeof node.attrs?.height === "number" ? node.attrs.height : undefined;
      return (
        <figure key={key} className="wiki-media-frame">
          {/* eslint-disable-next-line @next/next/no-img-element -- private signed media route */}
          <img
            src={`/api/wiki/media/${mediaId}/image`}
            alt={String(node.attrs?.alt ?? "")}
            width={width}
            height={height}
            loading="lazy"
            className="mx-auto h-auto max-h-[46rem] max-w-full rounded-xl object-contain ring-1 ring-border"
          />
          {node.attrs?.caption ? (
            <figcaption>{String(node.attrs.caption)}</figcaption>
          ) : null}
        </figure>
      );
    }
    case "wikiVideo":
      return (
        <figure key={key} className="wiki-media-frame">
          <WikiPrivateVideo mediaId={String(node.attrs?.mediaId ?? "")} />
          {node.attrs?.caption ? (
            <figcaption>{String(node.attrs.caption)}</figcaption>
          ) : null}
        </figure>
      );
    case "externalEmbed":
      return <ExternalEmbed key={key} node={node} />;
    case "doc":
      return <>{children}</>;
    default:
      return null;
  }
}

export function WikiDocumentView({ document }: { document: WikiDocument }) {
  return (
    <div className="wiki-prose">
      {renderNode(document, "wiki-document", new Map())}
    </div>
  );
}
