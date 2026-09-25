import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div
      className="w-full space-y-5"
      role="status"
      aria-busy="true"
      aria-label="Loading page"
    >
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true" className="space-y-5">
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-52 max-w-full" />
              <Skeleton className="h-4 w-[30rem] max-w-full" />
            </div>
          </div>
        </section>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
