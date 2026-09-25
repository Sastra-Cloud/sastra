import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type BudgetSectionDefinition = {
  id: string;
  label: string;
};

export function BudgetSectionNav({
  sections,
}: {
  sections: BudgetSectionDefinition[];
}) {
  return (
    <nav
      aria-label="Budget sections"
      className="sticky top-16 z-20 -mx-1 overflow-x-auto rounded-xl border bg-background/95 p-1 shadow-sm backdrop-blur-sm"
    >
      <div className="flex min-w-max gap-1">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function BudgetSection({
  id,
  title,
  description,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-32 rounded-xl border bg-card"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t p-4">{children}</div>
    </details>
  );
}
