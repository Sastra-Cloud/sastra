"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Bot,
  Compass,
  List,
  ListChecks,
  type LucideIcon,
  MessagesSquare,
  Search,
  Settings2,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { EmptyState } from "@/components/cockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { HelpDoc, HelpRole } from "@/lib/help/search";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Getting started": Compass,
  Work: ListChecks,
  Publishing: BookOpen,
  Communication: MessagesSquare,
  "AI & assistant": Bot,
  Settings: Settings2,
};

// Topics with a stable, non-project-scoped route get an "Open in app" link.
const TOPIC_ROUTES: Record<string, { href: string; label: string }> = {
  projects: { href: "/projects", label: "Open Projects" },
  tasks: { href: "/tasks", label: "Open My Work" },
  agenda: { href: "/tasks?view=agenda", label: "Open Agenda" },
  overview: { href: "/overview", label: "Open Overview" },
  workload: { href: "/workload", label: "Open Workload" },
  chat: { href: "/chat", label: "Open Chat" },
  standups: { href: "/standups", label: "Open Standups" },
  correspondence: { href: "/correspondence", label: "Open Correspondence" },
  assistant: { href: "/assistant", label: "Open Assistant" },
  notifications: { href: "/notifications", label: "Open Notifications" },
  settings: { href: "/settings", label: "Open Settings" },
};

function roleLabel(roles: HelpRole[]): string | null {
  if (roles.includes("member")) return null;
  if (roles.includes("manager")) return "Managers";
  return "Admins only";
}

function matches(doc: HelpDoc, query: string): boolean {
  const haystack = `${doc.title} ${doc.summary} ${doc.category} ${doc.keywords.join(
    " "
  )} ${doc.body}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

// Downshift body headings so the hierarchy stays PageHero h1 → title h2 → h3/h4.
// Forward only children so react-markdown's `node` extra-prop never reaches the DOM.
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
};

const PROSE_CLASS =
  "prose prose-sm max-w-[76ch] dark:prose-invert " +
  "prose-headings:font-heading prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground " +
  "prose-p:text-muted-foreground prose-p:leading-relaxed " +
  "prose-li:text-muted-foreground prose-li:leading-relaxed " +
  "prose-strong:text-foreground prose-strong:font-semibold " +
  "prose-em:text-foreground " +
  "prose-a:text-foreground prose-a:font-medium " +
  "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none " +
  "prose-table:text-sm prose-th:text-foreground prose-td:text-muted-foreground";

export function HelpBrowser({ docs }: { docs: HelpDoc[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [activeSlug, setActiveSlug] = useState(docs[0]?.slug ?? "");
  const [topicsOpen, setTopicsOpen] = useState(false);

  const trimmed = query.trim();
  const filtered = useMemo(
    () => (trimmed ? docs.filter((doc) => matches(doc, trimmed)) : docs),
    [docs, trimmed]
  );

  // Preserve category order by first appearance (docs arrive pre-sorted).
  const grouped = useMemo(() => {
    const map = new Map<string, HelpDoc[]>();
    for (const doc of filtered) {
      const list = map.get(doc.category);
      if (list) list.push(doc);
      else map.set(doc.category, [doc]);
    }
    return Array.from(map, ([category, items]) => ({ category, items }));
  }, [filtered]);

  const activeDoc =
    filtered.find((doc) => doc.slug === activeSlug) ?? filtered[0] ?? null;

  useEffect(() => {
    const sections = filtered
      .map((doc) => document.getElementById(doc.slug))
      .filter((section): section is HTMLElement => section != null);

    if (sections.length === 0) return;

    let frame = 0;
    const updateActiveTopic = () => {
      frame = 0;
      const readingLine = Math.min(180, window.innerHeight * 0.24);
      let current = sections[0];

      for (const section of sections) {
        if (section.getBoundingClientRect().top <= readingLine) current = section;
        else break;
      }

      setActiveSlug(current.id);
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveTopic);
    };

    updateActiveTopic();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [filtered]);

  useEffect(() => {
    const activeLink = document.querySelector<HTMLElement>(
      `[data-help-topic="${activeSlug}"]`
    );
    activeLink?.scrollIntoView({ block: "nearest" });
  }, [activeSlug]);

  return (
    <div className="space-y-4">
      <div className="sticky top-20 z-10 flex gap-2 rounded-xl border bg-background/95 p-1.5 shadow-sm supports-backdrop-filter:backdrop-blur-md">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <label htmlFor={searchId} className="sr-only">
            Search help topics
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search help (e.g. print run, standup, budget)…"
            className="h-10 w-full rounded-lg border bg-card pl-10 pr-4 text-sm text-foreground outline-none ring-primary/20 transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4"
          />
        </div>

        <Sheet open={topicsOpen} onOpenChange={setTopicsOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                className="gap-2 lg:hidden"
                aria-label="Browse help topics"
              />
            }
          >
            <List className="size-4" aria-hidden="true" />
            Topics
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[82dvh] gap-0 rounded-t-xl p-0">
            <SheetHeader className="border-b pr-14">
              <SheetTitle>Browse help topics</SheetTitle>
              <SheetDescription>
                {activeDoc ? `Currently reading: ${activeDoc.title}` : "Choose a topic"}
              </SheetDescription>
            </SheetHeader>
            <div className="overflow-y-auto overscroll-contain p-3">
              <a
                href="#help-top"
                onClick={() => setTopicsOpen(false)}
                className="mb-3 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
                Back to top
              </a>
              <div className="space-y-4">
                {grouped.map(({ category, items }) => (
                  <div key={category}>
                    <p className="px-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {category}
                    </p>
                    <nav aria-label={category} className="mt-1 grid gap-0.5">
                      {items.map((doc) => {
                        const isActive = doc.slug === activeDoc?.slug;
                        return (
                          <a
                            key={doc.slug}
                            href={`#${doc.slug}`}
                            aria-current={isActive ? "location" : undefined}
                            onClick={() => setTopicsOpen(false)}
                            className={cn(
                              "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {doc.title}
                          </a>
                        );
                      })}
                    </nav>
                  </div>
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <p aria-live="polite" className="sr-only">
        {filtered.length} help {filtered.length === 1 ? "topic" : "topics"}
        {trimmed ? ` matching “${trimmed}”` : ""}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title="No matching help topics"
          description={
            <>
              Nothing matches “{trimmed}”. Try a different word, or ask the Sastra
              Assistant — it can point you to the right place.
            </>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:sticky lg:top-40 lg:block lg:self-start">
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <p className="font-heading font-semibold">Help topics</p>
                  <p className="text-xs text-muted-foreground">
                    {filtered.length} {filtered.length === 1 ? "guide" : "guides"}
                  </p>
                </div>
                <a
                  href="#help-top"
                  className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Back to top"
                  title="Back to top"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </a>
              </div>
              <div className="max-h-[calc(100dvh-12rem)] space-y-4 overflow-y-auto overscroll-contain p-3">
                {grouped.map(({ category, items }) => (
                  <div key={category}>
                    <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {category}
                    </p>
                    <nav aria-label={category} className="mt-1 grid gap-0.5">
                      {items.map((doc) => {
                        const isActive = doc.slug === activeDoc?.slug;
                        return (
                          <a
                            key={doc.slug}
                            href={`#${doc.slug}`}
                            data-help-topic={doc.slug}
                            aria-current={isActive ? "location" : undefined}
                            className={cn(
                              "inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium transition-[background-color,color,box-shadow]",
                              isActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {doc.title}
                          </a>
                        );
                      })}
                    </nav>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {filtered.map((doc) => {
              const Icon = CATEGORY_ICONS[doc.category] ?? BookOpen;
              const badge = roleLabel(doc.roles);
              const route = TOPIC_ROUTES[doc.slug];
              return (
                <Card
                  key={doc.slug}
                  id={doc.slug}
                  className="surface-shadow scroll-mt-40"
                >
                  <CardContent className="py-5 sm:px-6 sm:py-6">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <h2 className="flex min-w-0 items-center gap-3 font-heading text-lg font-semibold tracking-tight">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">{doc.title}</span>
                      </h2>
                      {badge ? (
                        <Badge variant="secondary" className="shrink-0">
                          {badge}
                        </Badge>
                      ) : null}
                    </div>

                    <div className={PROSE_CLASS}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MARKDOWN_COMPONENTS}
                      >
                        {doc.body}
                      </ReactMarkdown>
                    </div>

                    {route ? (
                      <Link
                        href={route.href}
                        className="mt-5 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        {route.label}
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
