"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowRight,
  ArrowUpDown,
  ChevronDown,
  Filter,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { ProjectStatusBadge } from "@/components/badges";
import { ProjectCard } from "@/components/projects/project-card";
import { PrintFundingBadge } from "@/components/projects/print-funding-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { StaggerGroup, StaggerItem } from "@/components/motion/reveal";
import { daysUntil } from "@/lib/format";
import { portfolioDeadline } from "@/lib/projects/deadline";
import type { ProjectListItem } from "@/lib/projects/queries";
import { PROJECT_KIND_LABELS, type ProjectKind } from "@/lib/projects/kinds";
import {
  isArchivedProject,
  isCurrentProject,
} from "@/lib/projects/visibility";
import {
  comparePrintFunding,
  isBookProjectKind,
  isPrintFundingFilter,
  matchesPrintFundingFilter,
  projectFundingBadgeInfo,
  PRINT_FUNDING_FILTER_LABELS,
  PRINT_FUNDING_FILTERS,
  PRINT_FUNDING_LABELS,
  type PrintFundingFilter,
} from "@/lib/projects/print-funding";
import { bookFormatBadgeInfo } from "@/lib/projects/book-format";

const ALL = "all";

const STATUS_LABELS: Record<string, string> = {
  proposal: "Proposal",
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const NEED_LABELS: Record<string, string> = {
  [ALL]: "All projects",
  blocked: "Has blockers",
  overdue: "Overdue",
  reprint: "Active reprints",
  no_due: "No due date",
};

const SORT_LABELS: Record<string, string> = {
  due_asc: "Due date: earliest first",
  due_desc: "Due date: latest first",
  print_funding: "Print funding: needs first",
  recent: "Recently added",
};

const COMPACT_SORT_LABELS: Record<string, string> = {
  due_asc: "Due soonest",
  due_desc: "Due latest",
  print_funding: "Funding needs first",
  recent: "Newest first",
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesNeed(project: ProjectListItem, need: string) {
  if (need === "blocked") {
    return isCurrentProject(project) && project.blockerCount > 0;
  }
  if (need === "overdue") {
    if (!isCurrentProject(project)) return false;
    const days = daysUntil(portfolioDeadline(project));
    return days !== null && days < 0;
  }
  if (need === "reprint") return Boolean(project.activeReprintStatus);
  if (need === "no_due") {
    return isCurrentProject(project) && !portfolioDeadline(project);
  }
  return true;
}

function compareDueDates(
  a: ProjectListItem,
  b: ProjectListItem,
  direction: "due_asc" | "due_desc"
) {
  const aDueDate = portfolioDeadline(a);
  const bDueDate = portfolioDeadline(b);
  if (aDueDate === bDueDate) return 0;
  if (!aDueDate) return 1;
  if (!bDueDate) return -1;
  return direction === "due_asc"
    ? aDueDate.localeCompare(bDueDate)
    : bDueDate.localeCompare(aDueDate);
}

function filterProjects(
  projects: ProjectListItem[],
  filters: {
    query: string;
    status: string;
    projectKind: string;
    printFunding: PrintFundingFilter;
    need: string;
    optimisticDeleted: string | null;
  }
) {
  const q = normalize(filters.query);

  return projects.filter((project) => {
    if (project.id === filters.optimisticDeleted) return false;
    const fundingLabel = projectFundingBadgeInfo(
      project.printFundingStatus,
      project.fundingSummary
    ).label;
    const bookFormatLabel = project.bookFormat
      ? bookFormatBadgeInfo(
          project.bookFormat,
          project.printFundingStatus
        ).label
      : null;
    const haystack = normalize(
      [
        project.title,
        project.status,
        project.priority,
        project.kind,
        project.kind
          ? PROJECT_KIND_LABELS[project.kind as ProjectKind]
          : null,
        PRINT_FUNDING_LABELS[project.printFundingStatus],
        fundingLabel,
        bookFormatLabel,
        project.activeReprintTitle,
        project.activeReprintStatus,
      ]
        .filter(Boolean)
        .join(" ")
    );

    return (
      (!q || haystack.includes(q)) &&
      (filters.status === ALL || project.status === filters.status) &&
      (filters.projectKind === ALL || project.kind === filters.projectKind) &&
      matchesPrintFundingFilter(
        project.kind,
        project.printFundingStatus,
        filters.printFunding
      ) &&
      matchesNeed(project, filters.need)
    );
  });
}

type FilterSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  itemClassName?: string;
  id?: string;
};

function ProjectSearch({
  value,
  onValueChange,
  clearable = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  clearable?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={clearable ? "h-11 pr-10 pl-9" : "h-10 pl-9"}
        placeholder="Search projects, reprints, or priority"
        aria-label="Search projects"
      />
      {clearable && value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-1/2 right-0.5 size-11 -translate-y-1/2"
          onClick={() => onValueChange("")}
          aria-label="Clear search"
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function StatusSelect({
  value,
  onValueChange,
  statuses,
  className = "h-10 w-full",
  itemClassName,
  id,
}: FilterSelectProps & { statuses: string[] }) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? ALL)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue>
          {(next: string | null) =>
            next === ALL
              ? "All statuses"
              : STATUS_LABELS[next ?? ""] ?? "Status"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem className={itemClassName} value={ALL}>
          All statuses
        </SelectItem>
        {statuses.map((status) => (
          <SelectItem key={status} className={itemClassName} value={status}>
            {STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProjectKindSelect({
  value,
  onValueChange,
  kinds,
  className = "h-10 w-full",
  itemClassName,
  id,
}: FilterSelectProps & { kinds: ProjectKind[] }) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? ALL)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue>
          {(next: string | null) =>
            next === ALL
              ? "All types"
              : PROJECT_KIND_LABELS[next as ProjectKind] ?? "Type"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem className={itemClassName} value={ALL}>
          All types
        </SelectItem>
        {kinds.map((kind) => (
          <SelectItem key={kind} className={itemClassName} value={kind}>
            {PROJECT_KIND_LABELS[kind]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NeedSelect({
  value,
  onValueChange,
  className = "h-10 w-full",
  itemClassName,
  id,
}: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? ALL)}>
      <SelectTrigger id={id} className={className}>
        <Filter className="size-4 text-muted-foreground" />
        <SelectValue>
          {(next: string | null) => NEED_LABELS[next ?? ALL] ?? "All projects"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(NEED_LABELS).map(([need, label]) => (
          <SelectItem key={need} className={itemClassName} value={need}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PrintFundingSelect({
  value,
  onValueChange,
  className = "h-10 w-full",
  itemClassName,
  id,
}: Omit<FilterSelectProps, "value" | "onValueChange"> & {
  value: PrintFundingFilter;
  onValueChange: (value: PrintFundingFilter) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) =>
        onValueChange(isPrintFundingFilter(next) ? next : "all")
      }
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue>
          {(next: string | null) =>
            PRINT_FUNDING_FILTER_LABELS[
              isPrintFundingFilter(next) ? next : "all"
            ]
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PRINT_FUNDING_FILTERS.map((filter) => (
          <SelectItem key={filter} className={itemClassName} value={filter}>
            {PRINT_FUNDING_FILTER_LABELS[filter]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortSelect({
  value,
  onValueChange,
  compact = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next ?? "due_asc")}
    >
      <SelectTrigger
        className={compact ? "h-11 w-full" : "h-10 w-full"}
        aria-label="Sort projects"
      >
        <ArrowUpDown className="size-4 text-muted-foreground" />
        <SelectValue>
          {(next: string | null) =>
            (compact ? COMPACT_SORT_LABELS : SORT_LABELS)[next ?? "due_asc"] ??
            "Sort projects"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align={compact ? "end" : "center"}>
        {Object.entries(SORT_LABELS).map(([sort, label]) => (
          <SelectItem key={sort} value={sort}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProjectsBrowser({ projects }: { projects: ProjectListItem[] }) {
  const searchParams = useSearchParams();
  const optimisticDeleted = searchParams.get("optimisticDeleted");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [projectKind, setProjectKind] = useState(ALL);
  const [printFunding, setPrintFunding] = useState<PrintFundingFilter>(() => {
    const requested = searchParams.get("printFunding");
    return isPrintFundingFilter(requested) ? requested : "all";
  });
  const [need, setNeed] = useState(ALL);
  const [sort, setSort] = useState("due_asc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState(ALL);
  const [draftProjectKind, setDraftProjectKind] = useState(ALL);
  const [draftPrintFunding, setDraftPrintFunding] =
    useState<PrintFundingFilter>("all");
  const [draftNeed, setDraftNeed] = useState(ALL);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const statuses = useMemo(() => {
    const seen = new Set(projects.map((project) => project.status));
    return Object.keys(STATUS_LABELS).filter((value) => seen.has(value));
  }, [projects]);

  const kinds = useMemo(() => {
    const seen = new Set(projects.map((project) => project.kind).filter(Boolean));
    return (Object.keys(PROJECT_KIND_LABELS) as ProjectKind[]).filter((value) =>
      seen.has(value)
    );
  }, [projects]);

  const filtered = useMemo(() => {
    const matches = filterProjects(projects, {
      query,
      status,
      projectKind,
      printFunding,
      need,
      optimisticDeleted,
    });

    if (sort === "recent") return matches;
    if (sort === "print_funding") {
      return matches.sort(
        (a, b) => comparePrintFunding(a, b) || a.title.localeCompare(b.title)
      );
    }
    return matches.sort((a, b) =>
      compareDueDates(a, b, sort === "due_desc" ? "due_desc" : "due_asc")
    );
  }, [need, optimisticDeleted, printFunding, projectKind, projects, query, sort, status]);

  const currentProjects = useMemo(
    () => filtered.filter(isCurrentProject),
    [filtered]
  );
  const archivedProjects = useMemo(
    () => filtered.filter(isArchivedProject),
    [filtered]
  );
  const archiveForcedOpen =
    query.trim().length > 0 || status === "completed" || status === "cancelled";

  const draftResultCount = useMemo(
    () =>
      filterProjects(projects, {
        query,
        status: draftStatus,
        projectKind: draftProjectKind,
        printFunding: draftPrintFunding,
        need: draftNeed,
        optimisticDeleted,
      }).length,
    [
      draftNeed,
      draftProjectKind,
      draftPrintFunding,
      draftStatus,
      optimisticDeleted,
      projects,
      query,
    ]
  );

  const activeFilterCount =
    Number(status !== ALL) +
    Number(projectKind !== ALL) +
    Number(printFunding !== "all") +
    Number(need !== ALL);

  const hasFilters =
    query.trim().length > 0 ||
    status !== ALL ||
    projectKind !== ALL ||
    printFunding !== "all" ||
    need !== ALL;
  const clearFilters = () => {
    setQuery("");
    setStatus(ALL);
    setProjectKind(ALL);
    setPrintFunding("all");
    setNeed(ALL);
  };

  const handleFiltersOpenChange = (open: boolean) => {
    if (open) {
      setDraftStatus(status);
      setDraftProjectKind(projectKind);
      setDraftPrintFunding(printFunding);
      setDraftNeed(need);
    }
    setFiltersOpen(open);
  };

  const applyMobileFilters = () => {
    setStatus(draftStatus);
    setProjectKind(draftProjectKind);
    setPrintFunding(draftPrintFunding);
    setNeed(draftNeed);
    setFiltersOpen(false);
  };

  const resetDraftFilters = () => {
    setDraftStatus(ALL);
    setDraftProjectKind(ALL);
    setDraftPrintFunding("all");
    setDraftNeed(ALL);
  };

  const activeFilters = [
    status !== ALL
      ? {
          key: "status",
          label: STATUS_LABELS[status] ?? "Status",
          clear: () => setStatus(ALL),
        }
      : null,
    projectKind !== ALL
      ? {
          key: "kind",
          label: PROJECT_KIND_LABELS[projectKind as ProjectKind] ?? "Type",
          clear: () => setProjectKind(ALL),
        }
      : null,
    printFunding !== "all"
      ? {
          key: "print-funding",
          label: PRINT_FUNDING_FILTER_LABELS[printFunding],
          clear: () => setPrintFunding("all"),
        }
      : null,
    need !== ALL
      ? {
          key: "need",
          label: NEED_LABELS[need] ?? "Filter",
          clear: () => setNeed(ALL),
        }
      : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);

  return (
    <div className="space-y-4">
      <Card className="surface-shadow">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="space-y-3 2xl:hidden">
            <ProjectSearch
              value={query}
              onValueChange={setQuery}
              clearable
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_minmax(14rem,18rem)]">
              <Sheet open={filtersOpen} onOpenChange={handleFiltersOpenChange}>
                <SheetTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full justify-center"
                    />
                  }
                >
                  <SlidersHorizontal className="size-4" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </SheetTrigger>
                <SheetContent
                  side="bottom"
                  showCloseButton={false}
                  className="max-h-[85dvh] gap-0 rounded-t-xl p-0"
                >
                  <SheetHeader className="relative border-b px-4 py-4 pr-14">
                    <SheetTitle>Filter projects</SheetTitle>
                    <SheetDescription>
                      Narrow the portfolio by status, type, or what needs attention.
                    </SheetDescription>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-1.5 size-11"
                      onClick={() => setFiltersOpen(false)}
                      aria-label="Close filters"
                    >
                      <X className="size-4" />
                    </Button>
                  </SheetHeader>

                  <div className="space-y-5 overflow-y-auto px-4 py-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mobile-project-status">
                        Status
                      </label>
                      <StatusSelect
                        id="mobile-project-status"
                        value={draftStatus}
                        onValueChange={setDraftStatus}
                        statuses={statuses}
                        className="h-11 w-full"
                        itemClassName="min-h-11 px-3"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mobile-project-type">
                        Project type
                      </label>
                      <ProjectKindSelect
                        id="mobile-project-type"
                        value={draftProjectKind}
                        onValueChange={setDraftProjectKind}
                        kinds={kinds}
                        className="h-11 w-full"
                        itemClassName="min-h-11 px-3"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mobile-print-funding">
                        Print funding
                      </label>
                      <PrintFundingSelect
                        id="mobile-print-funding"
                        value={draftPrintFunding}
                        onValueChange={setDraftPrintFunding}
                        className="h-11 w-full"
                        itemClassName="min-h-11 px-3"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="mobile-project-need">
                        Needs attention
                      </label>
                      <NeedSelect
                        id="mobile-project-need"
                        value={draftNeed}
                        onValueChange={setDraftNeed}
                        className="h-11 w-full"
                        itemClassName="min-h-11 px-3"
                      />
                    </div>
                  </div>

                  <SheetFooter className="grid grid-cols-[auto_1fr] gap-2 border-t bg-popover px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={resetDraftFilters}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      className="h-11"
                      onClick={applyMobileFilters}
                    >
                      Show {draftResultCount} project
                      {draftResultCount === 1 ? "" : "s"}
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

              <SortSelect
                value={sort}
                onValueChange={setSort}
                compact
              />
            </div>

            {activeFilters.length > 0 ? (
              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                aria-label="Active project filters"
              >
                {activeFilters.map((filter) => (
                  <Button
                    key={filter.key}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-11 shrink-0 rounded-full px-3"
                    onClick={filter.clear}
                    aria-label={`Remove ${filter.label} filter`}
                  >
                    {filter.label}
                    <X className="size-3.5" />
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 shrink-0 rounded-full px-3"
                  onClick={clearFilters}
                >
                  Clear all
                </Button>
              </div>
            ) : null}
          </div>

          <div className="hidden gap-3 2xl:grid 2xl:grid-cols-[minmax(12.5rem,1fr)_7.75rem_8rem_11.25rem_9.25rem_13.75rem_auto]">
            <ProjectSearch value={query} onValueChange={setQuery} />
            <StatusSelect
              value={status}
              onValueChange={setStatus}
              statuses={statuses}
            />
            <ProjectKindSelect
              value={projectKind}
              onValueChange={setProjectKind}
              kinds={kinds}
            />
            <PrintFundingSelect
              value={printFunding}
              onValueChange={setPrintFunding}
            />
            <NeedSelect value={need} onValueChange={setNeed} />
            <SortSelect
              value={sort}
              onValueChange={setSort}
            />

            <Button
              type="button"
              variant="outline"
              className="h-10 justify-self-end"
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              <X className="size-4" />
              Clear
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm text-muted-foreground">
            <span aria-live="polite">
              {currentProjects.length} current · {archivedProjects.length} archived
              {filtered.length !== projects.length ? ` · ${filtered.length} matching` : ""}
            </span>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden h-8 sm:inline-flex 2xl:hidden"
                onClick={clearFilters}
              >
                Clear all
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {currentProjects.length > 0 ? (
        <section className="space-y-3" aria-labelledby="current-projects-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="current-projects-heading" className="font-heading text-lg font-semibold">
              Current work
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {currentProjects.length} project{currentProjects.length === 1 ? "" : "s"}
            </span>
          </div>
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currentProjects.map((project) => (
              <StaggerItem key={project.id} className="h-full">
                <ProjectCard p={project} />
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Search className="size-9 text-muted-foreground" />
            <div>
              <p className="font-medium">No matching projects</p>
              <p className="text-sm text-muted-foreground">
                Adjust the search or clear filters to see the full portfolio.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={clearFilters}>
              <X className="size-4" />
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {archivedProjects.length > 0 ? (
        <details
          className="group overflow-hidden rounded-xl border bg-card"
          open={archiveForcedOpen || archiveOpen}
          onToggle={(event) => {
            if (!archiveForcedOpen) setArchiveOpen(event.currentTarget.open);
          }}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden select-none [&::-webkit-details-marker]:hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Archive className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading font-semibold">Project archive</span>
              <span className="block text-xs text-muted-foreground">
                Completed and cancelled projects stay available for history and reprints.
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {archivedProjects.length}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>

          <div className="grid border-t sm:grid-cols-2">
            {archivedProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.slug}`}
                transitionTypes={["project-detail"]}
                className="group/archive-row flex min-h-16 items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 font-heading text-sm font-semibold text-primary/80">
                  {project.title.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover/archive-row:text-primary">
                    {project.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <ProjectStatusBadge status={project.status} />
                    {project.kind ? (
                      <span className="text-xs text-muted-foreground">
                        {PROJECT_KIND_LABELS[project.kind as ProjectKind]}
                      </span>
                    ) : null}
                    {isBookProjectKind(project.kind) ? (
                      <PrintFundingBadge
                        status={project.printFundingStatus}
                        compact
                      />
                    ) : null}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground sm:flex">
                  {project.status === "completed" &&
                  project.kind !== "podcast" &&
                  project.kind !== "video_series"
                    ? "Details & reprints"
                    : "View details"}
                  <ArrowRight className="size-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
