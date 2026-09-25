import Link from "next/link";

type MessageToken =
  | { type: "text"; value: string }
  | { type: "wiki-link"; value: string };

const WIKI_PATH =
  /(^|[\s(])(\/wiki\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:#[A-Za-z0-9_-]+)?)(?=$|[\s).,!?:;])/g;

export function tokenizeAssistantWikiLinks(content: string): MessageToken[] {
  const tokens: MessageToken[] = [];
  let cursor = 0;
  for (const match of content.matchAll(WIKI_PATH)) {
    const index = match.index ?? 0;
    const prefix = match[1] ?? "";
    const href = match[2];
    const linkStart = index + prefix.length;
    if (linkStart > cursor) {
      tokens.push({ type: "text", value: content.slice(cursor, linkStart) });
    }
    tokens.push({ type: "wiki-link", value: href });
    cursor = linkStart + href.length;
  }
  if (cursor < content.length) {
    tokens.push({ type: "text", value: content.slice(cursor) });
  }
  return tokens.length > 0 ? tokens : [{ type: "text", value: content }];
}

export function AssistantMessageContent({ content }: { content: string }) {
  return tokenizeAssistantWikiLinks(content).map((token, index) =>
    token.type === "wiki-link" ? (
      <Link
        key={`${token.value}-${index}`}
        href={token.value}
        className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        {token.value}
      </Link>
    ) : (
      token.value
    )
  );
}
