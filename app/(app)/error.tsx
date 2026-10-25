"use client";

import Link from "next/link";
import { CircleHelp, House, RotateCcw, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ContentColumn } from "@/components/cockpit";
import { isAppUpdateError } from "@/lib/pwa/deployment-guard";
import { reloadForAppUpdate } from "@/lib/pwa/client-update";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const updated = isAppUpdateError(error);
  return (
    <ContentColumn
      width="compact"
      className="flex min-h-[55dvh] items-center py-12"
      role="alert"
    >
      <section className="w-full rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="font-heading text-2xl font-semibold">{updated ? "Refresh to continue" : "This page hit a problem"}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {updated
            ? "Sastra has been updated. Refresh the app, then check your work before trying again. Nothing will be sent again automatically."
            : "Try loading this page again, or return to a known place and continue from there."}
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={updated ? () => { reloadForAppUpdate(); } : reset}>
            <RotateCcw className="size-4" />
            {updated ? "Refresh app" : "Try again"}
          </Button>
          <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
            <House className="size-4" />
            Dashboard
          </Link>
          <Link href="/help" className={buttonVariants({ variant: "ghost" })}>
            <CircleHelp className="size-4" />
            Help
          </Link>
        </div>
      </section>
    </ContentColumn>
  );
}
