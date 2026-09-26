import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CoachCard } from "@/components/guidance/coach-card";
import { getHelpDoc, getHelpSection } from "@/lib/help/content";

// Keep coaching prose compact — no headings, just text and lists.
const COACH_MARKDOWN: Components = {
  h1: ({ children }) => <p className="font-medium text-foreground">{children}</p>,
  h2: ({ children }) => <p className="font-medium text-foreground">{children}</p>,
  h3: ({ children }) => <p className="font-medium text-foreground">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} className="font-medium text-primary hover:underline">
      {children}
    </a>
  ),
};

const COACH_PROSE =
  "prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-p:text-muted-foreground " +
  "prose-li:my-0.5 prose-li:text-muted-foreground prose-strong:text-foreground prose-ul:my-1";

/**
 * Server component that renders a coach card from a help doc, so on-screen
 * guidance stays in `content/help/*.md` (the single source) instead of being
 * duplicated in TSX. Sources the doc summary by default, or a named `##`
 * section when `heading` is given. Renders nothing if the doc/section is absent.
 */
export function GuidancePanel({
  guidanceKey,
  slug,
  heading,
  title,
  action,
  className,
}: {
  guidanceKey: string;
  slug: string;
  heading?: string;
  /** Overrides the doc title for the card heading. */
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const doc = getHelpDoc(slug);
  if (!doc) return null;
  const body = heading ? getHelpSection(slug, heading) : doc.summary;
  if (!body) return null;

  return (
    <CoachCard
      guidanceKey={guidanceKey}
      title={title ?? doc.title}
      helpSlug={slug}
      action={action}
      className={className}
    >
      <p>{doc.summary}</p>
      {heading ? <details>
      <summary className="cursor-pointer font-medium text-foreground">Show steps</summary>
      <div className={COACH_PROSE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={COACH_MARKDOWN}>
          {body}
        </ReactMarkdown>
      </div>
      </details> : null}
    </CoachCard>
  );
}
