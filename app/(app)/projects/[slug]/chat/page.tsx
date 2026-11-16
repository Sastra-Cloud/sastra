import { getWorkspaceSettings } from "@/lib/workspace/queries";
import Link from "next/link";
import { projectChatAccessCondition } from "@/lib/chat/access-sql";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { getProjectHeader } from "@/lib/projects/queries";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import {
  getProjectChannel,
  getRecentMessages,
  listProjectChannels,
} from "@/lib/chat/queries";
import { listChannelPins } from "@/lib/chat/pins";
import { ProjectChatView } from "@/components/chat/project-chat-view";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ProjectChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { slug } = await params;
  const { channel: selectedChannelId } = await searchParams;
  const { user } = await requireUser();
  const [project, workspace] = await Promise.all([getProjectHeader(slug), getWorkspaceSettings()]);
  if (!project) notFound();

  const [allowed] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, project.id), projectChatAccessCondition(project.id, user.id))).limit(1);
  if (!allowed) return <div className="space-y-3 p-4">
    <h2 className="text-lg font-semibold">Join the project to use its chats</h2>
    <p className="text-sm text-muted-foreground">Ask a project manager or workspace admin to add you. Project chats and their files are available to project people.</p>
    <Link href={`/projects/${slug}/members`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">View project people</Link>
  </div>;

  const channels = await listProjectChannels(project.id, user.id);
  const channel =
    channels.find((item) => item.id === selectedChannelId) ??
    (await getProjectChannel(project.id));
  if (!channel) {
    return (
      <p className="text-sm text-muted-foreground">
        This project has no chat channel.
      </p>
    );
  }
  const [messages, members, pins] = await Promise.all([
    getRecentMessages(channel.id, user.id),
    listProjectMentionTargets(project.id),
    listChannelPins(channel.id, user.id),
  ]);

  return (
    <ProjectChatView
      key={channel.id}
      slug={slug}
      projectTitle={project.title}
      channels={channels}
      activeChannel={channel}
      currentUser={{
        id: user.id,
        name: user.name,
        image: user.image ?? null,
        timezone: user.timezone ?? workspace.timezone,
      }}
      messages={messages}
      members={members}
      pins={pins}
    />
  );
}
