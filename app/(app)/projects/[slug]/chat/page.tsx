import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { getProjectHeader } from "@/lib/projects/queries";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import {
  getProjectChannel,
  getRecentMessages,
  listProjectChannels,
} from "@/lib/chat/queries";
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
  const project = await getProjectHeader(slug);
  if (!project) notFound();

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
  const [messages, members] = await Promise.all([
    getRecentMessages(channel.id, user.id),
    listProjectMentionTargets(project.id),
  ]);

  return (
    <ProjectChatView
      key={channel.id}
      slug={slug}
      channels={channels}
      activeChannel={channel}
      currentUser={{
        id: user.id,
        name: user.name,
        image: user.image ?? null,
      }}
      messages={messages}
      members={members}
    />
  );
}
