"use client";

import Link from "next/link";
import { useEffect, useId, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/cockpit";
import { Badge } from "@/components/ui/badge";
import type { HelpTopic } from "@/lib/help/content";
import { usePropState } from "@/hooks/use-prop-state";

export function HelpBrowser({ topics }: { topics: HelpTopic[] }) {
  const params = useSearchParams();
  const [query, setLocalQuery] = usePropState(params.get("q") ?? "");
  function setQuery(value: string) {
    setLocalQuery(value);
    const next = new URLSearchParams(window.location.search);
    if (value) next.set("q", value);
    else next.delete("q");
    window.history.replaceState(
      null,
      "",
      `/help${next.size ? `?${next}` : ""}`,
    );
  }
  const searchId = useId();
  const router = useRouter();
  const filtered = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return topics.filter((topic) =>
      terms.every((term) => topic.searchText.includes(term)),
    );
  }, [query, topics]);
  const grouped = useMemo(() => {
    const categories = new Map<string, HelpTopic[]>();
    for (const topic of filtered) {
      const group = categories.get(topic.category) ?? [];
      group.push(topic);
      categories.set(topic.category, group);
    }
    return Array.from(categories);
  }, [filtered]);

  // Keep bookmarked links from the former all-in-one guide working.
  useEffect(() => {
    function followLegacyTopic() {
      const slug = window.location.hash.slice(1);
      if (topics.some((topic) => topic.slug === slug))
        router.replace(`/help/${slug}`);
    }
    followLegacyTopic();
    window.addEventListener("hashchange", followLegacyTopic);
    return () => window.removeEventListener("hashchange", followLegacyTopic);
  }, [router, topics]);

  return (
    <section className="space-y-6" aria-label="Help guides">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full space-y-2 sm:max-w-xl">
          <label htmlFor={searchId} className="text-sm font-medium">
            Find a guide
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics, questions, or keywords"
              className="h-11 pl-10 pr-11"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="absolute right-0 top-0"
                aria-label="Clear help search"
                onClick={() => {
                  setQuery("");
                  document.getElementById(searchId)?.focus();
                }}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "guide" : "guides"}
          {query.trim() ? " found" : " to explore"}
        </p>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="size-5" />}
          title="No guides found"
          description="Try a broader phrase, such as tasks, printing, or notifications."
          action={
            <Button variant="outline" size="lg" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          {grouped.map(([category, docs]) => (
            <section
              key={category}
              className="min-w-0 rounded-xl border bg-card"
            >
              <div className="flex items-center gap-3 border-b px-5 py-4">
                <BookOpen aria-hidden="true" className="size-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold">
                  {category}
                </h2>
                <span className="ml-auto text-sm text-muted-foreground">
                  {docs.length}
                </span>
              </div>
              <ul className="divide-y">
                {docs.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/help/${doc.slug}`}
                      className="group flex min-h-16 items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{doc.title}</h3>
                          {!doc.roles.includes("member") && (
                            <Badge variant="secondary">
                              {doc.roles.includes("manager")
                                ? "Managers"
                                : "Admins"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {doc.summary}
                        </p>
                      </div>
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform motion-safe:group-hover:translate-x-1"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
