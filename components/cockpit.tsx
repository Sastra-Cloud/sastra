import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

const contentWidths = {
  compact: "max-w-2xl",
  focused: "max-w-3xl",
  reading: "max-w-6xl",
  full: "max-w-none",
};

export function AppCanvas({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      {...props}
      data-app-canvas
      className={cn("mx-auto w-full min-w-0 max-w-[88rem]", className)}
    >
      {children}
    </div>
  );
}

export function PageShell({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div {...props} className={cn("w-full min-w-0 space-y-6", className)}>
      {children}
    </div>
  );
}

export function ContentColumn({
  children,
  className,
  width = "focused",
  ...props
}: ComponentPropsWithoutRef<"div"> & {
  width?: keyof typeof contentWidths;
}) {
  return (
    <div
      {...props}
      className={cn(
        "mx-auto w-full min-w-0",
        contentWidths[width],
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHero({
  icon,
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "surface-shadow relative min-w-0 overflow-hidden rounded-xl border bg-card p-4 text-card-foreground md:p-5",
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--brand-orange),var(--brand-violet),var(--brand-coral))]" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-pretty md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-pretty text-sm text-muted-foreground md:text-base">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export function TabScroller({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative min-w-0 max-w-full", className)}>
      <div className="pointer-events-none absolute inset-y-1 left-1 z-10 w-6 rounded-l-lg bg-[linear-gradient(90deg,var(--card),transparent)] sm:hidden" />
      <div className="pointer-events-none absolute inset-y-1 right-1 z-10 w-8 rounded-r-lg bg-[linear-gradient(270deg,var(--card),transparent)] sm:hidden" />
      <div className="max-w-full overflow-x-auto rounded-xl bg-card p-1 ring-1 ring-border/80">
        <nav
          aria-label={ariaLabel}
          className="flex min-w-max snap-x snap-mandatory gap-1"
        >
          {children}
        </nav>
      </div>
    </div>
  );
}

export function tabTriggerClass(active: boolean, className?: string) {
  return cn(
    "inline-flex min-h-10 snap-start items-center gap-2 rounded-lg px-3 text-sm font-medium transition-[background-color,color,box-shadow,scale] duration-150 ease-out active:scale-[0.96]",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    className
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed bg-background/55 px-5 py-10 text-center",
        className
      )}
    >
      {icon ? (
        <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15">
          {icon}
        </span>
      ) : null}
      <p className="font-heading text-lg font-semibold text-foreground text-pretty">
        {title}
      </p>
      {description ? (
        <p className="mt-1 max-w-sm text-pretty text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
