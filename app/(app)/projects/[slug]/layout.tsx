import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowRight, ChevronLeft, Layers3, Settings2 } from "lucide-react";

import { ProjectActions } from "@/components/projects/project-actions";
import { ProjectWorkspaceFrame } from "@/components/projects/project-workspace-frame";
import { PageHero } from "@/components/cockpit";
import { getProjectHeader } from "@/lib/projects/queries";
import { getActiveReprintRun } from "@/lib/print/queries";
import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { PriorityBadge, ProjectStatusBadge } from "@/components/badges";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectImportButton } from "@/components/imports/project-import-button";
import { CompleteProjectButton } from "@/components/projects/complete-project-button";
import { dueLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listSharedMouGroupsForProject } from "@/lib/agreements/queries";
import {
  PROJECT_KIND_LABELS,
  VIDEO_PRODUCTION_MODE_LABELS,
  type ProjectKind,
  type VideoProductionMode,
} from "@/lib/projects/kinds";
import { PrintFundingBadge } from "@/components/projects/print-funding-badge";
import { BookFormatBadge } from "@/components/projects/book-format-badge";
import { isBookProjectKind } from "@/lib/projects/print-funding";
import { getProjectFundingSummary } from "@/lib/projects/funding-queries";
import { Button } from "@/components/ui/button";
import {
  ProjectTitleHeading,
  ProjectTitleProvider,
} from "@/components/projects/project-title-context";

export default async function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectHeader(slug);
  if (!project) notFound();
  const [activeReprint, fundingSummary] = await Promise.all([
    getActiveReprintRun(project.id),
    getProjectFundingSummary(project.id),
  ]);

  const session = await getSession();
  const isManager =
    can(session?.user ?? null, "project.edit");
  const sharedMouGroups = isManager
    ? await listSharedMouGroupsForProject(project.id)
    : [];

  const isClosed = project.status === "completed" || project.status === "cancelled";
  const due = dueLabel(
    activeReprint?.campaignDueDate ?? (isClosed ? null : project.dueDate)
  );
  const hasPrintWorkflow =
    project.kind !== "podcast" && project.kind !== "video_series";

  return (
    <ProjectTitleProvider initialTitle={project.title}>
      <ProjectWorkspaceFrame>
      <PageHero
        className="project-header !p-3 [&_h1]:text-xl md:[&_h1]:text-2xl"
        eyebrow={
          <Link
            href="/projects"
            transitionTypes={["project-list"]}
            className="inline-flex min-h-8 items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Projects
          </Link>
        }
        title={<ProjectTitleHeading projectSlug={slug} canEdit={isManager} />}
        actions={
          isManager ? (
            <div className="flex flex-wrap items-center gap-2">
              <ProjectActions>
              {project.status !== "proposal" &&
              project.status !== "completed" &&
              project.status !== "cancelled" ? (
                <CompleteProjectButton
                  projectId={project.id}
                  className="w-full sm:w-auto"
                />
              ) : null}
              <ProjectImportButton
                projectId={project.id}
                className="w-full sm:w-auto"
              />
              </ProjectActions>
              <Button
                nativeButton={false}
                render={<Link href={`/projects/${slug}?settings=1`} />}
                variant="outline"
                size="sm"
              >
                <Settings2 className="size-4" />
                Project settings
              </Button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <ProjectStatusBadge status={project.status} />
          {!isClosed || activeReprint ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                due.tone === "overdue" &&
                  "border-destructive/30 bg-destructive/10 text-destructive",
                due.tone === "soon" &&
                  "border-warning/30 bg-warning/10 text-warning-text",
                due.tone === "none" &&
                  "border-border bg-background text-muted-foreground"
              )}
            >
              {activeReprint ? `Reprint · ${due.text}` : due.text}
            </span>
          ) : null}
          <details className="project-secondary group w-full sm:w-auto">
            <summary className="cursor-pointer text-xs text-muted-foreground sm:hidden">Project details</summary>
            <div className="mt-2 hidden flex-wrap items-center gap-2 group-open:flex sm:mt-0 sm:flex">
          {project.kind ? (
            <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {PROJECT_KIND_LABELS[project.kind as ProjectKind]}
            </span>
          ) : null}
          {project.kind === "video_series" ? (
            <span className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {VIDEO_PRODUCTION_MODE_LABELS[
                (project.videoProductionMode ?? "original") as VideoProductionMode
              ]}
            </span>
          ) : null}
          {isBookProjectKind(project.kind) ? (
            <BookFormatBadge
              evidence={project.bookFormat}
              printFundingStatus={project.printFundingStatus}
            />
          ) : null}
          {isBookProjectKind(project.kind) ? (
            <PrintFundingBadge
              status={project.printFundingStatus}
              summary={fundingSummary}
            />
          ) : null}
          {activeReprint ? (
            <span className="rounded-full border border-info/30 bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
              {activeReprint.printNumber
                ? `Active reprint ${activeReprint.printNumber}`
                : "Active reprint"}
            </span>
          ) : null}
          <PriorityBadge priority={project.priority} />
            </div>
          </details>
        </div>
      </PageHero>

      {isClosed ? (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center",
            project.status === "completed"
              ? "border-success/30 bg-success/5"
              : "bg-muted/35"
          )}
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background",
              project.status === "completed"
                ? "border-success/30 text-success"
                : "text-muted-foreground"
            )}
          >
            <Archive className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {activeReprint
                ? "Publication complete · reprint in progress"
                : project.status === "completed"
                  ? "Completed project"
                  : "Cancelled project"}
            </p>
            <p className="text-sm text-muted-foreground">
              {activeReprint
                ? "The original project stays completed while reprint tasks, quotes, funding, and payments are tracked as a separate run."
                : project.status === "completed"
                  ? `This project is out of the current portfolio. Its history stays available${hasPrintWorkflow ? ", and another print run can start here when needed." : "."}`
                  : "This project is out of the current portfolio, but its history remains available for reference."}
            </p>
          </div>
          {project.status === "completed" && hasPrintWorkflow ? (
            <Link
              href={
                activeReprint
                  ? `/projects/${slug}/print?run=${activeReprint.id}`
                  : `/projects/${slug}/print`
              }
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {activeReprint ? "Open reprint" : "Print & reprints"}
              <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <ProjectTabs slug={slug} kind={project.kind} />

      {sharedMouGroups.map((group) => (
        <Link
          key={group.id}
          href={`/agreements/${group.id}`}
          className="project-extra flex items-start gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm transition-colors hover:border-info/50"
        >
          <Layers3 className="mt-0.5 size-4 shrink-0 text-info" />
          <span>
            Covered by shared MoU <strong>{group.name}</strong>. Completion and
            invoicing are tracked across the full agreement group.
          </span>
        </Link>
      ))}

      <div className="project-content min-w-0">{children}</div>
      </ProjectWorkspaceFrame>
    </ProjectTitleProvider>
  );
}
