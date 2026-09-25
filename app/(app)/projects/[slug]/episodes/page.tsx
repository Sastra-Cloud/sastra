import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { isEpisodicKind } from "@/lib/projects/kinds";
import { getProjectHeader } from "@/lib/projects/queries";
import { getEpisodeData } from "@/lib/episodes/queries";
import { EpisodesManager } from "@/components/episodes/episodes-manager";

export const metadata = { title: "Videos & episodes" };
export const dynamic = "force-dynamic";

export default async function ProjectEpisodesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireUser();
  const project = await getProjectHeader(slug);
  if (!project) notFound();
  // Episodes are for episodic kinds (podcast / video series); keep book/article
  // projects from reaching this tab.
  if (!isEpisodicKind(project.kind)) notFound();

  const role = session.user.role as string;
  const canEdit = can(role, "project.edit");
  const data = await getEpisodeData(project.id);

  return (
    <EpisodesManager
      projectId={project.id}
      projectSlug={project.slug}
      projectTitle={project.title}
      canEdit={canEdit}
      currentUserId={session.user.id}
      data={data}
    />
  );
}
