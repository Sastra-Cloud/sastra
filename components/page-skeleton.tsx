import { ViewTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function LoadingFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mx-auto w-full min-w-0", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

function CardSkeleton({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        className
      )}
    >
      {children}
    </div>
  );
}

function PageHeroSkeleton({
  actions = 1,
  eyebrow = false,
}: {
  actions?: number;
  eyebrow?: boolean;
}) {
  return (
    <div className="surface-shadow relative overflow-hidden rounded-xl border bg-card p-4 md:p-5">
      <Skeleton className="absolute inset-x-0 top-0 h-1 rounded-none" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Skeleton className="size-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            {eyebrow ? <Skeleton className="h-3 w-24" /> : null}
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-[32rem] max-w-full" />
          </div>
        </div>
        {actions > 0 ? (
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            {Array.from({ length: actions }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-10 w-full rounded-lg sm:w-28"
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlainHeaderSkeleton({
  action = true,
}: {
  action?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-8 w-48 max-w-full" />
        <Skeleton className="h-4 w-[34rem] max-w-full" />
      </div>
      {action ? <Skeleton className="h-9 w-36 rounded-lg" /> : null}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <CardSkeleton className="h-[7.75rem] space-y-3">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-1.5">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-24" />
      </div>
    </CardSkeleton>
  );
}

function StatGridSkeleton({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <StatCardSkeleton key={index} />
      ))}
    </div>
  );
}

function SectionHeadingSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function RowListSkeleton({
  rows = 4,
  rowClassName,
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <CardSkeleton className="space-y-0 p-0">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex h-14 items-center gap-3 border-b px-4 last:border-b-0",
            rowClassName
          )}
        >
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </CardSkeleton>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <div className="min-w-[56rem] bg-card">
        <div className="grid h-10 grid-cols-[5rem_2fr_repeat(6,1fr)] items-center gap-3 border-b px-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="grid h-12 grid-cols-[5rem_2fr_repeat(6,1fr)] items-center gap-3 border-b px-3 last:border-b-0"
          >
            {Array.from({ length: 8 }).map((_, column) => (
              <Skeleton
                key={column}
                className={cn("h-4", column === 1 ? "w-4/5" : "w-full")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <PageHeroSkeleton />
        <StatGridSkeleton />
        <div className="space-y-2">
          <SectionHeadingSkeleton />
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <CardSkeleton key={index} className="h-28 space-y-2 p-3">
                <Skeleton className="size-7 rounded-lg" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </CardSkeleton>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <SectionHeadingSkeleton />
          <RowListSkeleton rows={4} />
        </div>
      </div>
    </LoadingFrame>
  );
}

export function OverviewSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <PlainHeaderSkeleton />
        <div className="grid gap-4 lg:grid-cols-3">
          <CardSkeleton className="h-[16.5rem] sm:h-[16.5rem] lg:h-full">
            <div className="flex h-full items-center gap-5">
              <Skeleton className="size-32 shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          </CardSkeleton>
          <StatGridSkeleton
            count={4}
            className="sm:grid-cols-2 lg:col-span-2"
          />
        </div>
        <TableSkeleton />
        <div className="grid gap-4 lg:grid-cols-2">
          <CardSkeleton className="h-48" />
          <CardSkeleton className="h-48" />
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ProjectsSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <PageHeroSkeleton actions={3} />
        <CardSkeleton className="surface-shadow space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(16rem,1fr)_10.5rem_11rem_12rem_13rem_auto]">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton
                key={index}
                className={cn(
                  "h-10 rounded-lg",
                  index === 0 && "md:col-span-2 xl:col-span-1",
                  index === 5 && "w-24"
                )}
              />
            ))}
          </div>
          <Skeleton className="h-4 w-36" />
        </CardSkeleton>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} className="h-[13.5rem] space-y-4">
              <div className="flex gap-3">
                <Skeleton className="size-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              </div>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-24" />
            </CardSkeleton>
          ))}
        </div>
      </div>
    </LoadingFrame>
  );
}

export function StandupsSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <PageHeroSkeleton eyebrow />
        <StatGridSkeleton />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <CardSkeleton key={index} className="min-h-40 space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-32 rounded-full" />
              </div>
              <Skeleton className="h-12 w-full rounded-lg" />
            </CardSkeleton>
          ))}
        </div>
      </div>
    </LoadingFrame>
  );
}

export function WorkloadSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <PlainHeaderSkeleton />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton
              key={index}
              className={cn(
                "space-y-4",
                index === 0 && "min-h-80",
                index === 1 && "min-h-40 lg:min-h-80",
                index > 1 && "min-h-40"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
              {Array.from({ length: index === 0 ? 3 : index === 1 ? 1 : 0 }).map(
                (__, row) => (
                  <Skeleton key={row} className="h-12 w-full rounded-md" />
                )
              )}
            </CardSkeleton>
          ))}
        </div>
      </div>
    </LoadingFrame>
  );
}

/** The project hero and tabs render in the parent layout, so these fallbacks
 * represent only the changing tab content below them. */
export function ProjectOverviewSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <CardSkeleton className="h-28 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </CardSkeleton>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-6">
            <CardSkeleton className="h-56 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-36 w-full rounded-lg" />
            </CardSkeleton>
            <div className="space-y-3">
              <Skeleton className="h-6 w-24" />
              <RowListSkeleton rows={4} />
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            <CardSkeleton className="h-40 space-y-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-2 w-full rounded-full" />
            </CardSkeleton>
            <CardSkeleton className="h-40 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </CardSkeleton>
          </div>
        </div>
      </div>
    </LoadingFrame>
  );
}

/** Full nested-project fallback used while the project layout itself loads. */
export function ProjectWorkspaceSkeleton({ slug }: { slug: string }) {
  const share = {
    "project-detail": "project-mark-morph",
    "project-list": "project-mark-morph",
    default: "none",
  } as const;
  const titleShare = {
    "project-detail": "project-title-morph",
    "project-list": "project-title-morph",
    default: "none",
  } as const;

  return (
    <LoadingFrame>
      <div className="space-y-5">
        <CardSkeleton className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <ViewTransition
              name={`project-mark-${slug}`}
              share={share}
              default="none"
            >
              <Skeleton className="size-12 shrink-0 rounded-xl" />
            </ViewTransition>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <ViewTransition
                name={`project-title-${slug}`}
                share={titleShare}
                default="none"
              >
                <Skeleton className="h-8 w-56 max-w-full" />
              </ViewTransition>
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>
            <div className="hidden gap-2 sm:flex">
              <Skeleton className="h-10 w-28 rounded-lg" />
              <Skeleton className="h-10 w-40 rounded-lg" />
            </div>
          </div>
        </CardSkeleton>
        <Skeleton className="h-12 rounded-xl" />
        <ProjectOverviewSkeleton />
      </div>
    </LoadingFrame>
  );
}

export function ProjectChatSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-3">
        <Skeleton className="h-11 w-full rounded-xl" />
        <ConversationLoadingSkeleton variant="project" />
      </div>
    </LoadingFrame>
  );
}

export function ChatChannelSkeleton() {
  return (
    <LoadingFrame>
      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <CardSkeleton className="hidden min-h-[34rem] space-y-5 p-3 lg:block">
          {Array.from({ length: 3 }).map((_, section) => (
            <div key={section} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              {Array.from({ length: section === 2 ? 3 : 2 }).map(
                (_, row) => (
                  <div
                    key={row}
                    className="flex h-10 items-center gap-2 rounded-lg px-1"
                  >
                    <Skeleton className="size-7 shrink-0 rounded-lg" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                )
              )}
            </div>
          ))}
        </CardSkeleton>
        <div className="min-w-0 space-y-3">
          <CardSkeleton className="flex min-h-28 items-center gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-56 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </CardSkeleton>
          <ConversationLoadingSkeleton variant="team" />
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ConversationLoadingSkeleton({
  variant,
  fillAvailable = false,
}: {
  variant: "project" | "team";
  fillAvailable?: boolean;
}) {
  return (
    <CardSkeleton
      className={cn(
        "flex flex-col overflow-hidden p-0",
        fillAvailable
          ? "h-full min-h-0 flex-1"
          : variant === "project"
          ? "h-[calc(100vh-26rem)] min-h-[20rem] max-h-[34rem]"
          : "h-[calc(100vh-14rem)] min-h-[32rem]"
      )}
    >
      <div className="relative flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_20%_0%,oklch(0.69_0.14_35_/_0.09),transparent_24rem)]">
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-background/92 px-5 py-4 shadow-sm">
          <Loader2
            aria-hidden="true"
            className="size-6 animate-spin text-primary motion-reduce:animate-none"
          />
          <span className="text-sm font-medium text-muted-foreground">
            Loading messages…
          </span>
        </div>
      </div>
      <div className="shrink-0 border-t bg-background/80 p-3">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </CardSkeleton>
  );
}

export function ProjectMembersSkeleton() {
  return (
    <LoadingFrame>
      <div className="grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start">
        <CardSkeleton className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </CardSkeleton>
        <div className="grid min-w-0 gap-2 2xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} className="flex h-14 items-center gap-3 p-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </CardSkeleton>
          ))}
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ProjectTasksSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <CardSkeleton className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </CardSkeleton>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, column) => (
              <div key={column} className="space-y-2">
                <div className="flex justify-between px-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-6 rounded-full" />
                </div>
                <div className="min-h-24 space-y-2 rounded-lg bg-muted/40 p-2">
                  {column === 0 ? (
                    <Skeleton className="h-28 w-full rounded-md" />
                  ) : (
                    <Skeleton className="mx-auto mt-4 h-3 w-24" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ProjectPipelineSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-4">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
          <TableSkeleton rows={7} />
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ProjectTaskPlanSkeleton() {
  return (
    <LoadingFrame className="max-w-3xl">
      <div className="space-y-5">
        <Skeleton className="h-5 w-20" />
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-full" />
          </div>
          <CardSkeleton className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg sm:col-span-2" />
            <Skeleton className="h-24 w-full rounded-lg sm:col-span-2" />
          </CardSkeleton>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ProjectBudgetSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-5">
        <CardSkeleton className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </CardSkeleton>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <CardSkeleton key={index} className="h-[6.5rem] space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
            </CardSkeleton>
          ))}
        </div>
        <CardSkeleton className="h-24 space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </CardSkeleton>
        <CardSkeleton className="h-24 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardSkeleton>
        <TableSkeleton rows={5} />
        {Array.from({ length: 2 }).map((_, index) => (
          <CardSkeleton key={index} className="h-44 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </CardSkeleton>
        ))}
      </div>
    </LoadingFrame>
  );
}

export function ProjectRightsSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,27rem)]">
          <div className="space-y-5">
            <CardSkeleton className="min-h-[30rem] space-y-5">
              <Skeleton className="h-6 w-40" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-lg" />
                ))}
              </div>
            </CardSkeleton>
          </div>
          <div className="space-y-5">
            <CardSkeleton className="h-72 space-y-4">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </CardSkeleton>
            <CardSkeleton className="h-48 space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </CardSkeleton>
          </div>
        </div>
        <CardSkeleton className="h-52" />
      </div>
    </LoadingFrame>
  );
}

export function ProjectPrintSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <CardSkeleton key={index} className="h-24 space-y-2 p-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-full" />
            </CardSkeleton>
          ))}
        </div>
        <CardSkeleton className="min-h-72 space-y-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-48 rounded-lg" />
          </div>
        </CardSkeleton>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
          <CardSkeleton className="h-80" />
          <div className="space-y-5">
            <CardSkeleton className="h-40" />
            <CardSkeleton className="h-40" />
          </div>
        </div>
      </div>
    </LoadingFrame>
  );
}

export function ProjectEpisodesSkeleton() {
  return (
    <LoadingFrame>
      <div className="space-y-4 pb-24">
        <CardSkeleton className="overflow-hidden p-5 lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-7 w-56 max-w-full" />
                </div>
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-2 bg-card p-3">
                  <Skeleton className="h-6 w-10" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        </CardSkeleton>
        <CardSkeleton className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1.4fr)_repeat(5,minmax(120px,1fr))_auto]">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-8 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-8 w-full" />
        </CardSkeleton>
        <div className="hidden md:block">
          <TableSkeleton rows={7} />
        </div>
        <div className="space-y-0 overflow-hidden rounded-xl ring-1 ring-foreground/10 md:hidden">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-3 border-b bg-card p-4 last:border-b-0">
              <div className="flex gap-3">
                <Skeleton className="size-5 shrink-0" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </LoadingFrame>
  );
}
