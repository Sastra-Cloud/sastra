import { ProjectTaskViews } from "@/components/projects/project-task-views";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getProjectPipeline } from "@/lib/tasks/queries";
import { PipelineView } from "@/components/projects/pipeline-view";
import { projectUnitTerms } from "@/lib/projects/kinds";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function ProjectPipelinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const [project] = await db
    .select({ id: projects.id, kind: projects.kind })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) notFound();

  const data = await getProjectPipeline(project.id);

  return (
    <div className="space-y-4">
      <ProjectTaskViews slug={slug} />
      <PipelineView
        data={data}
        projectSlug={slug}
        unitLabel={projectUnitTerms(project.kind).singular}
      />
    </div>
  );
}
