import Link from "next/link";
import { ArrowLeft, CalendarPlus } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { listProjects } from "@/lib/projects/queries";
import { Reveal } from "@/components/motion/reveal";
import {
  MissingDueDates,
  type MissingDueDateProject,
} from "@/components/portfolio/missing-due-dates";
import { ContentColumn, PageShell } from "@/components/cockpit";

export const metadata = { title: "Projects without a due date" };
export const dynamic = "force-dynamic";

// Only live work needs a target completion date; finished/parked projects don't.
const NEEDS_DUE_DATE = new Set(["planning", "active", "on_hold"]);

export default async function MissingDueDatesPage() {
  await requireRole("manager");
  const projects = await listProjects();

  const missing: MissingDueDateProject[] = projects
    .filter((p) => !p.dueDate && NEEDS_DUE_DATE.has(p.status))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      healthStatus: p.healthStatus,
    }));

  return (
    <PageShell>
      <Reveal className="space-y-3">
        <Link
          href="/overview"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to overview
        </Link>
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            <CalendarPlus className="size-5.5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
              Projects without a due date
            </h1>
            <p className="text-pretty text-muted-foreground">
              Give each active project a target completion date so it appears on
              the timeline, forecast, and &ldquo;coming due&rdquo; lists. Set a
              date inline, or open a project for its full settings.
            </p>
          </div>
        </div>
      </Reveal>

      <ContentColumn width="focused">
        <Reveal>
          <MissingDueDates projects={missing} />
        </Reveal>
      </ContentColumn>
    </PageShell>
  );
}
