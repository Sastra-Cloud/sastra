import LinkifyIt from "linkify-it";

const linkify = new LinkifyIt({ fuzzyEmail: false }).add("ftp:", null);

type MessageSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

/** Keep plain text intact; only web URLs become navigable, never HTML or scripts. */
export function messageLinkSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let offset = 0;
  for (const match of linkify.match(text) ?? []) {
    let url: URL;
    try {
      url = new URL(match.schema ? match.url : `https://${match.raw.replace(/^\/\//, "")}`);
    } catch { continue; }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
    if (match.index > offset) segments.push({ type: "text", text: text.slice(offset, match.index) });
    segments.push({ type: "link", text: match.raw, href: url.href });
    offset = match.lastIndex;
  }
  if (offset < text.length) segments.push({ type: "text", text: text.slice(offset) });
  return segments;
}

/** One preview keeps multi-link messages compact. Used by both renderer and authorization. */
export function firstMessageLink(text: string): string | null {
  const link = messageLinkSegments(text).find(segment => segment.type === "link");
  return link?.type === "link" ? link.href : null;
}
