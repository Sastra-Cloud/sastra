import Link from "next/link";
import { CircleHelp, House, SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ContentColumn } from "@/components/cockpit";

export default function AppNotFound() {
  return (
    <ContentColumn width="compact" className="flex min-h-[55dvh] items-center py-12">
      <section className="w-full rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <SearchX className="size-5" />
        </span>
        <h1 className="font-heading text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          This link may be out of date, or the item may have moved. Return to the
          Dashboard or use Help to find the current workflow.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/dashboard" className={buttonVariants()}>
            <House className="size-4" />
            Dashboard
          </Link>
          <Link href="/help" className={buttonVariants({ variant: "outline" })}>
            <CircleHelp className="size-4" />
            Help
          </Link>
        </div>
      </section>
    </ContentColumn>
  );
}
