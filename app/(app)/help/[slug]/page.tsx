import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHero, PageShell } from "@/components/cockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { getHelpDoc, getHelpDocs } from "@/lib/help/content";

const TOPIC_ROUTES: Record<
  string,
  { href: string; label: string; manager?: boolean }
> = {
  projects: { href: "/projects", label: "Open Projects" },
  tasks: { href: "/tasks", label: "Open My Work" },
  agenda: { href: "/tasks?view=agenda", label: "Open Agenda" },
  overview: { href: "/overview", label: "Open Team planning", manager: true },
  workload: { href: "/workload", label: "Open Workload", manager: true },
  chat: { href: "/chat", label: "Open Chat" },
  standups: { href: "/standups", label: "Open Standups" },
  correspondence: {
    href: "/correspondence",
    label: "Open Correspondence",
    manager: true,
  },
  assistant: { href: "/assistant", label: "Open Assistant" },
  notifications: { href: "/notifications", label: "Open Notifications" },
  settings: { href: "/settings", label: "Open Settings" },
  support: { href: "/support", label: "Open Support & requests" },
};
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h2>{children}</h2>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = getHelpDoc((await params).slug);
  return { title: doc ? `${doc.title} · Help` : "Guide not found" };
}

export default async function HelpGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { user } = await requireUser();
  const doc = getHelpDoc((await params).slug);
  if (!doc) notFound();
  const docs = getHelpDocs();
  const related = docs.filter((topic) => topic.category === doc.category);
  const position = docs.findIndex((topic) => topic.slug === doc.slug);
  const previous = docs[position - 1],
    next = docs[position + 1];
  const route = TOPIC_ROUTES[doc.slug];
  const allowedRoute =
    route && (!route.manager || can(user.role ?? "member", "workspace.manage"));

  const relatedLinks = (
    <nav aria-label="Related help guides" className="mt-2 grid gap-1">
      {related.map((topic) => (
        <Link
          key={topic.slug}
          href={`/help/${topic.slug}`}
          aria-current={topic.slug === doc.slug ? "page" : undefined}
          className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${topic.slug === doc.slug ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
        >
          {topic.title}
        </Link>
      ))}
    </nav>
  );

  return (
    <PageShell>
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <Link
          href="/help"
          className="inline-flex min-h-11 items-center gap-2 font-medium text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All help guides
        </Link>
        <span aria-hidden="true">/</span>
        <span>{doc.category}</span>
      </nav>
      <PageHero
        icon={<BookOpen className="size-6" />}
        title={doc.title}
        description={doc.summary}
        actions={
          allowedRoute ? (
            <Button
              variant="outline"
              size="lg"
              render={<Link href={route.href} />}
            >
              {route.label}
              <ArrowUpRight aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24">
          <div className="hidden rounded-xl border bg-card p-4 lg:block">
            <h2 className="py-2 text-sm font-semibold">
              More in {doc.category}
            </h2>
            {relatedLinks}
          </div>
          <details className="rounded-xl border bg-card p-4 lg:hidden">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
              Browse related guides
            </summary>
            {relatedLinks}
          </details>
        </aside>
        <article className="min-w-0 rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8">
          {!doc.roles.includes("member") && (
            <Badge variant="secondary" className="mb-5">
              {doc.roles.includes("manager")
                ? "For managers and admins"
                : "For admins"}
            </Badge>
          )}
          <div className="prose max-w-[75ch] dark:prose-invert prose-headings:font-heading prose-headings:text-foreground prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground prose-a:font-medium prose-a:text-primary prose-pre:max-w-full prose-table:text-sm">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {doc.body}
            </ReactMarkdown>
          </div>
          <nav
            aria-label="Previous and next guide"
            className="mt-8 grid gap-3 border-t pt-5 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={`/help/${previous.slug}`}
                className="flex min-h-11 items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-muted-foreground">
                    Previous guide
                  </span>
                  <span className="font-medium">{previous.title}</span>
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link
                href={`/help/${next.slug}`}
                className="flex min-h-11 items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  <span className="block text-muted-foreground">
                    Next guide
                  </span>
                  <span className="font-medium">{next.title}</span>
                </span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            )}
          </nav>
        </article>
      </div>
    </PageShell>
  );
}
