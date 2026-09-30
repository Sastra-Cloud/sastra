"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type BudgetSectionDefinition = {
  id: string;
  label: string;
  attentionCount?: number;
};

/** Keep every editor mounted while showing one budget section at a time. */
export function BudgetTabs({
  sections, children,
}: {
  sections: BudgetSectionDefinition[];
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "planning");
  const sectionIds = sections.map(section => section.id).join("|");

  function revealField(target: Element) {
    const id = target.closest<HTMLElement>("[data-budget-section]")?.dataset.budgetSection;
    if (id && sections.some(section => section.id === id)) setActiveId(id);
  }

  useEffect(() => {
    const ids = sectionIds.split("|");
    let frame = 0;
    let historyNavigation = false;
    let historyTimer = 0;
    function revealHash(scroll: boolean) {
      let id: string;
      try { id = decodeURIComponent(window.location.hash.slice(1)); }
      catch { return; }
      const target = id ? document.getElementById(id) : null;
      const sectionId = target?.closest<HTMLElement>("[data-budget-section]")?.dataset.budgetSection;
      setActiveId(sectionId && ids.includes(sectionId) ? sectionId : ids[0] ?? "planning");
      if (target && sectionId && scroll) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "instant" }));
      }
    }
    function onHashChange() { revealHash(!historyNavigation); }
    function onPopState() {
      historyNavigation = true;
      revealHash(false);
      historyTimer = window.setTimeout(() => { historyNavigation = false; }, 0);
    }
    revealHash(true);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onPopState);
    const root = rootRef.current;
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.target instanceof Element && record.target.getAttribute("aria-invalid") === "true") {
          const id = record.target.closest<HTMLElement>("[data-budget-section]")?.dataset.budgetSection;
          if (id) setActiveId(id);
        }
      }
    });
    if (root) observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-invalid"] });
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
      cancelAnimationFrame(frame);
      clearTimeout(historyTimer);
      observer.disconnect();
    };
  }, [sectionIds]);

  useEffect(() => {
    const tab = rootRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    const scroller = tab?.closest<HTMLElement>("[data-budget-tab-scroller]");
    if (tab && scroller) {
      const bounds = scroller.getBoundingClientRect();
      const rect = tab.getBoundingClientRect();
      if (rect.left < bounds.left || rect.right > bounds.right) scroller.scrollBy({ left: rect.left - bounds.left, behavior: "instant" });
    }
  }, [activeId]);

  return (
    <div ref={rootRef} onInvalidCapture={event => {
      const target = event.target;
      if (target instanceof Element) flushSync(() => revealField(target));
    }}>
      <Tabs value={activeId} onValueChange={value => {
        if (typeof value !== "string") return;
        setActiveId(value);
        if (window.location.hash !== `#${value}`) window.history.pushState(null, "", `#${value}`);
      }} className="gap-5">
        <div data-budget-tab-scroller className="sticky top-16 z-20 overflow-x-auto border-b bg-background/95 backdrop-blur-sm">
          <TabsList variant="line" aria-label="Budget sections" className="w-max min-w-full justify-start p-0 group-data-horizontal/tabs:h-auto">
            {sections.map(section => (
              <TabsTrigger key={section.id} value={section.id} className="h-11 flex-none rounded-none border-0 px-3 data-active:text-primary after:bg-primary group-data-horizontal/tabs:after:bottom-0 motion-reduce:transition-none">
                {section.label}
                {section.attentionCount ? <span className="rounded bg-warning/15 px-1.5 text-xs tabular-nums text-warning-text">{section.attentionCount}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {children}
      </Tabs>
    </div>
  );
}

export function BudgetSection({
  id,
  title,
  description,
  summary,
  children,
}: {
  id: string;
  title: string;
  description: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <TabsContent value={id} keepMounted data-budget-section={id}>
      <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div><h2 id={`${id}-heading`} className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
          {summary ? <span className="text-xs tabular-nums text-muted-foreground">{summary}</span> : null}
        </header>
        {children}
      </section>
    </TabsContent>
  );
}
