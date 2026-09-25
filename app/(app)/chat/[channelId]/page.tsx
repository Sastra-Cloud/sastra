import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, Hash, FolderKanban } from "lucide-react";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import {
  getChannelById,
  getRecentMessages,
  listDirectMessageCandidates,
  listProjectChannels,
} from "@/lib/chat/queries";
import {
  listAllMentionTargets,
  listMentionTargetsByIds,
  listProjectMentionTargets,
} from "@/lib/mentions/roster";
import { ChannelMembersSheet } from "@/components/chat/channel-members-sheet";
import { ChatThread } from "@/components/chat/chat-thread";
import { ProjectChannelTabs } from "@/components/chat/project-channel-tabs";
import { ConversationLoadingSkeleton } from "@/components/page-skeleton";
import { avatarSrc } from "@/lib/users/avatar";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

export default async function ChatChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const { user } = await requireUser();

  const channel = await getChannelById(channelId, user.id);
  if (!channel) notFound();

  const isProject = channel.kind === "project";
  const isDirect = channel.kind === "direct";
  const isCustom = channel.kind === "custom";
  const [projectChannels, directCandidates] = await Promise.all([
    isProject && channel.projectId
      ? listProjectChannels(channel.projectId, user.id)
      : Promise.resolve([]),
    isCustom ? listDirectMessageCandidates(user.id) : Promise.resolve([]),
  ]);

  const Icon = isProject ? FolderKanban : isDirect ? null : Hash;
  const projectSlug = channel.projectSlug;
  const projectTitle = channel.projectTitle;
  const canManageMembers = can(user, "chat.manageMembers");
  const mobileTitle =
    isProject && projectTitle
      ? projectTitle
      : isDirect
        ? channel.directUserName
        : channel.name;
  const mobileContext = isProject
    ? `#${channel.name}`
    : isDirect
      ? "Private conversation"
      : isCustom
        ? "Private team channel"
        : "Workspace channel";

  return (
    <div className="flex h-full min-w-0 min-h-0 flex-col gap-2 lg:gap-3">
      <div className="surface-shadow flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-2 lg:gap-3 lg:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 lg:block">
          <div className="flex min-w-0 items-center lg:hidden">
            <Link
              href="/chat"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
              <span className="sr-only">Back to chats</span>
            </Link>
          </div>
          <div className="min-w-0">
            <nav
              aria-label="Chat breadcrumb"
              className="mb-2 hidden min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground lg:flex"
            >
              <Link href="/chat" className="hover:text-foreground">
                Chat
              </Link>
              <ChevronRight className="size-3.5" />
              <span>
                {isProject ? "Projects" : isDirect ? "Direct messages" : "Team"}
              </span>
              {isProject && projectTitle ? (
                <>
                  <ChevronRight className="size-3.5" />
                  <span className="min-w-0 truncate">{projectTitle}</span>
                </>
              ) : null}
              <ChevronRight className="size-3.5" />
              <span className="truncate text-foreground">
                {isDirect ? channel.directUserName : channel.name}
              </span>
            </nav>
            <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold lg:font-heading lg:text-2xl lg:tracking-tight">
              {Icon ? (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
              ) : (
                <DirectAvatar
                  name={channel.directUserName}
                  image={channel.directUserImage}
                />
              )}
              <span className="min-w-0 truncate">
                <span className="lg:hidden">{mobileTitle}</span>
                <span className="hidden lg:inline">
                  {isProject && projectTitle
                    ? `${projectTitle} · ${channel.name}`
                    : isDirect
                      ? channel.directUserName
                      : channel.name}
                </span>
              </span>
            </h1>
            <p className="truncate text-xs text-muted-foreground lg:mt-1 lg:text-sm">
              <span className="lg:hidden">{mobileContext}</span>
              <span className="hidden lg:inline">
                {isProject
                  ? `Project ${channel.name.toLowerCase()} channel for focused decisions, files, and updates.`
                  : isDirect
                    ? "Private conversation between you and this teammate."
                    : isCustom
                      ? "Private team channel for selected teammates."
                      : "Workspace-wide channel for everyone."}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isCustom ? (
            <ChannelMembersSheet
              channelId={channel.id}
              channelName={channel.name}
              members={channel.channelMembers}
              candidates={directCandidates}
              currentUserId={user.id}
              canManage={canManageMembers}
            />
          ) : null}
          {isProject && projectSlug ? (
            <Link
              href={`/projects/${projectSlug}`}
              className="inline-flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-background text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:w-auto lg:px-3"
            >
              <span className="sr-only lg:not-sr-only">View project</span>
              <ArrowRight className="size-4 lg:size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
      {isProject && projectSlug && projectChannels.length > 0 ? (
        <ProjectChannelTabs
          slug={projectSlug}
          channels={projectChannels}
          activeId={channelId}
          mode="chat"
        />
      ) : null}
      <Suspense
        key={channelId}
        fallback={
          <ConversationLoadingSkeleton
            variant={isProject ? "project" : "team"}
            fillAvailable
          />
        }
      >
        <ChannelConversation channel={channel} user={user} />
      </Suspense>
    </div>
  );
}

async function ChannelConversation({
  channel,
  user,
}: {
  channel: NonNullable<Awaited<ReturnType<typeof getChannelById>>>;
  user: Awaited<ReturnType<typeof requireUser>>["user"];
}) {
  const isProject = channel.kind === "project";
  const isDirect = channel.kind === "direct";
  const [messages, members] = await Promise.all([
    getRecentMessages(channel.id, user.id),
    isDirect || channel.kind === "custom"
      ? listMentionTargetsByIds(channel.participantIds)
      : channel.projectId
        ? listProjectMentionTargets(channel.projectId)
        : listAllMentionTargets(),
  ]);

  return (
    <ChatThread
      key={channel.id}
      channelId={channel.id}
      currentUserId={user.id}
      currentUserName={user.name}
      currentUserImage={user.image ?? null}
      initialMessages={messages}
      members={members}
      variant={isProject ? "project" : "team"}
      contextLabel={
        isProject
          ? `${channel.name} discourse`
          : isDirect
            ? `Conversation with ${channel.directUserName}`
            : "Team discourse"
      }
      emptyDescription={
        isProject
          ? `Keep ${channel.name.toLowerCase()} decisions, files, and updates together for this project.`
          : undefined
      }
      placeholder={
        isProject
          ? `Message #${channel.name.toLowerCase()}...`
          : isDirect
            ? `Message ${channel.directUserName}...`
            : undefined
      }
      fillAvailable
    />
  );
}

function DirectAvatar({
  name,
  image,
}: {
  name: string | null;
  image: string | null;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const photo = avatarSrc(image);

  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-primary/10 text-sm font-semibold text-primary">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
