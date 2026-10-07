import Link from "next/link";
import {
  Bug,
  Inbox,
  LifeBuoy,
  Lightbulb,
  MessagesSquare,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function HelpSupportActions({ connected }: { connected: boolean }) {
  return (
    <section
      aria-labelledby="help-support-heading"
      className="flex flex-col gap-5 rounded-xl border bg-card p-5 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <h2 id="help-support-heading" className="text-base font-semibold">
          Need a hand, or have an idea?
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {connected
            ? "Start a private conversation with Sastra support or suggest an improvement."
            : "Get help from the community or suggest an improvement on GitHub."}
        </p>
      </div>
      <div className="grid gap-2 min-[480px]:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
        {connected ? (
          <>
            <Button
              size="lg"
              render={<Link href="/support?category=support" />}
            >
              <LifeBuoy aria-hidden="true" />
              Contact support
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={<Link href="/support?category=bug" />}
            >
              <Bug aria-hidden="true" />
              Report a problem
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={<Link href="/support?category=feature" />}
            >
              <Lightbulb aria-hidden="true" />
              Request a feature
            </Button>
            <Button
              variant="ghost"
              size="lg"
              render={<Link href="/support?view=requests" />}
            >
              <Inbox aria-hidden="true" />
              My requests
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" render={<Link href="/support" />}>
              <MessagesSquare aria-hidden="true" />
              Community help
            </Button>
            <Button
              variant="outline"
              size="lg"
              render={
                <a
                  href="https://github.com/Sastra-Cloud/sastra/issues/new/choose"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Lightbulb aria-hidden="true" />
              Bugs &amp; feature ideas
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
