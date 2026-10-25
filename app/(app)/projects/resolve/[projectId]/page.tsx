import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
export default async function ResolveProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireUser();
  const { projectId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(projectId)) notFound();
  const [project] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, projectId));
  if (!project) notFound();
  const enabled = moduleEnabled((await getWorkspaceSettings()).enabledModules, "lectio");
  redirect(`/projects/${project.slug}${enabled ? "/translation" : ""}`);
}
