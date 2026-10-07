import { PageShell } from "@/components/cockpit";
import { Skeleton } from "@/components/ui/skeleton";

export default function HelpGuideLoading() {
  return (
    <PageShell aria-label="Loading help guide" aria-busy="true">
      <Skeleton className="h-11 w-40" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </PageShell>
  );
}
