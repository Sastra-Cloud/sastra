import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  fileAttachments,
  files,
  projects,
  tasks,
  units,
} from "@/lib/db/schema";
import { listAssignableUsers, listProjectRoles } from "@/lib/projects/queries";
import { PlanWizard } from "@/components/projects/plan-wizard";

export const metadata = { title: "Set up task plan" };
export const dynamic = "force-dynamic";

export default async function GeneratePlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireRole("manager");
  const { slug } = await params;

  const [project] = await db
    .select({ id: projects.id, title: projects.title, kind: projects.kind })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) notFound();

  const [users, roles, unitRows, taskRow, docRow] = await Promise.all([
    listAssignableUsers(),
    listProjectRoles(),
    db.select({ id: units.id }).from(units).where(eq(units.projectId, project.id)).limit(1),
    db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, project.id)).limit(1),
    db
      .select({ id: fileAttachments.id })
      .from(fileAttachments)
      .innerJoin(files, eq(files.id, fileAttachments.fileId))
      .where(
        and(
          eq(fileAttachments.targetType, "project"),
          eq(fileAttachments.targetId, project.id),
          eq(files.status, "ready")
        )
      )
      .limit(1),
  ]);

  // Default the type: a project with chapters or print/ebook leans "book".
  const defaultKind = project.kind ?? (unitRows.length > 0 ? "book" : "article");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Link
        href={`/projects/${slug}/tasks`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Tasks
      </Link>
      <PlanWizard
        projectId={project.id}
        slug={slug}
        projectTitle={project.title}
        defaultKind={defaultKind}
        hasDocument={docRow.length > 0}
        hasTasks={taskRow.length > 0}
        users={users.map((u) => ({ id: u.id, name: u.name }))}
        roles={roles.map((r) => ({ key: r.key, label: r.label }))}
      />
    </div>
  );
}
