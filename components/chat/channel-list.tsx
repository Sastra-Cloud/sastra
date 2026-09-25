"use client";

import {
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  FolderKanban,
  Hash,
  Loader2,
  Languages,
  LayoutTemplate,
  Megaphone,
  PenLine,
  Pin,
  Search,
  X,
} from "lucide-react";

import type {
  ChannelListItem,
  DirectMessageCandidate,
  DirectMessageListItem,
  ProjectChatSummary,
  ProjectSidebarChannel,
} from "@/lib/chat/queries";
import { avatarSrc } from "@/lib/users/avatar";
import { cn } from "@/lib/utils";
import { useChatNavigation } from "./chat-navigation-context";
import { CreateChannelDialog } from "./create-channel-dialog";
import { ProjectPinToggle } from "./project-pin-toggle";
import { NewDirectMessagePopover } from "./new-direct-message-popover";

const RECENT_PROJECT_LIMIT = 12;

export function ChannelList({
  channels,
  directMessages,
  directCandidates,
  projects,
  activeId,
  activeProjectId,
  canCreate = false,
}: {
  channels: ChannelListItem[];
  directMessages: DirectMessageListItem[];
  directCandidates: DirectMessageCandidate[];
  projects: ProjectChatSummary[];
  activeId?: string;
  activeProjectId?: string | null;
  canCreate?: boolean;
}) {
  const { pendingChannelId: pendingId, beginNavigation } = useChatNavigation();
  const [query, setQuery] = useState("");
  const [showAllRecent, setShowAllRecent] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesQuery = (value: string) =>
    value.toLocaleLowerCase().includes(normalizedQuery);
  const visibleDirectMessages = directMessages.map((message) =>
    message.id === activeId ? { ...message, unread: 0 } : message
  );
  const visibleChannels = channels.map((channel) =>
    channel.id === activeId ? { ...channel, unread: 0 } : channel
  );
  const visibleProjects = projects.map((project) => {
    const activeChannelUnread =
      project.channels.find((channel) => channel.id === activeId)?.unread ?? 0;
    if (activeChannelUnread === 0) return project;

    return {
      ...project,
      unread: Math.max(0, project.unread - activeChannelUnread),
      channels: project.channels.map((channel) =>
        channel.id === activeId ? { ...channel, unread: 0 } : channel
      ),
    };
  });
  const filteredDirectMessages = normalizedQuery
    ? visibleDirectMessages.filter((message) => matchesQuery(message.name))
    : visibleDirectMessages;
  const filteredChannels = normalizedQuery
    ? visibleChannels.filter((channel) => matchesQuery(channel.name))
    : visibleChannels;
  const filteredProjects = normalizedQuery
    ? visibleProjects.filter(
        (project) =>
          matchesQuery(project.projectTitle) ||
          project.channels.some((channel) => matchesQuery(channel.name))
      )
    : visibleProjects;
  const pinnedProjects = filteredProjects.filter((project) => project.pinned);
  const unreadProjects = filteredProjects.filter(
    (project) => !project.pinned && project.unread > 0
  );
  const recentProjects = filteredProjects.filter(
    (project) => !project.pinned && project.unread === 0
  );
  const visibleRecentProjects =
    normalizedQuery || showAllRecent
      ? recentProjects
      : recentProjects.filter(
          (project, index) =>
            index < RECENT_PROJECT_LIMIT ||
            project.projectId === activeProjectId
        );
  const hiddenRecentCount =
    recentProjects.length - visibleRecentProjects.length;
  const hasSearchResults =
    filteredDirectMessages.length > 0 ||
    filteredChannels.length > 0 ||
    filteredProjects.length > 0;
  const visibleProjectId = activeProjectId ?? null;

  function handleProjectNavigate(
    event: MouseEvent<HTMLAnchorElement>,
    channelId: string
  ) {
    if (shouldUseNativeNavigation(event)) return;
    beginNavigation(channelId);
  }

  function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
    return (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.currentTarget.target === "_blank"
    );
  }

  function handleTeamNavigate(
    event: MouseEvent<HTMLAnchorElement>,
    href: string
  ) {
    if (shouldUseNativeNavigation(event)) return;
    const channelId = href.split("/").pop();
    if (channelId) beginNavigation(channelId);
  }

  return (
    <nav className="surface-shadow rounded-xl border bg-card p-2 text-card-foreground">
      <div className="px-1 pb-1 pt-0.5">
        <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-background px-2.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/35">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="sr-only">Find a conversation</span>
          <input
            type="text"
            role="searchbox"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a conversation"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear conversation search"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>
      <DirectSection
        messages={filteredDirectMessages}
        candidates={normalizedQuery ? [] : directCandidates}
        activeId={activeId}
        pendingId={pendingId}
        onNavigate={handleTeamNavigate}
      />
      <Section
        title="Team"
        channels={filteredChannels}
        activeId={activeId}
        pendingId={pendingId}
        onNavigate={handleTeamNavigate}
        action={
          canCreate && !normalizedQuery ? (
            <CreateChannelDialog candidates={directCandidates} />
          ) : undefined
        }
      />
      <ProjectSection
        title="Pinned Projects"
        projects={pinnedProjects}
        activeId={activeId}
        activeProjectId={activeProjectId}
        visibleProjectId={visibleProjectId}
        pendingId={pendingId}
        onNavigate={handleProjectNavigate}
      />
      <ProjectSection
        title="New activity"
        projects={unreadProjects}
        activeId={activeId}
        activeProjectId={activeProjectId}
        visibleProjectId={visibleProjectId}
        pendingId={pendingId}
        onNavigate={handleProjectNavigate}
      />
      <ProjectSection
        title="Recent Projects"
        projects={visibleRecentProjects}
        activeId={activeId}
        activeProjectId={activeProjectId}
        visibleProjectId={visibleProjectId}
        pendingId={pendingId}
        onNavigate={handleProjectNavigate}
        hiddenCount={hiddenRecentCount}
        onShowAll={() => setShowAllRecent(true)}
      />
      {normalizedQuery && !hasSearchResults ? (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          No conversations match “{query.trim()}”.
        </p>
      ) : null}
    </nav>
  );
}

const PROJECT_ICONS: Record<string, typeof Hash> = {
  general: Hash,
  translation: Languages,
  editing: PenLine,
  layout: LayoutTemplate,
  marketing: Megaphone,
};

function ProjectSection({
  title,
  projects,
  activeId,
  activeProjectId,
  visibleProjectId,
  pendingId,
  onNavigate,
  hiddenCount = 0,
  onShowAll,
}: {
  title: string;
  projects: ProjectChatSummary[];
  activeId?: string;
  activeProjectId?: string | null;
  visibleProjectId?: string | null;
  pendingId?: string | null;
  onNavigate?: (
    event: MouseEvent<HTMLAnchorElement>,
    channelId: string
  ) => void;
  hiddenCount?: number;
  onShowAll?: () => void;
}) {
  if (projects.length === 0) return null;

  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center gap-2 px-2.5 pb-1">
        {title === "Pinned Projects" ? (
          <Pin className="size-3 text-muted-foreground/60" />
        ) : null}
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          {title}
        </p>
      </div>
      <div className="space-y-1">
        {projects.map((project) => (
          <ProjectRow
            key={project.projectId}
            project={project}
            activeId={activeId}
            active={project.projectId === activeProjectId}
            expanded={project.projectId === visibleProjectId}
            pendingId={pendingId}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      {hiddenCount > 0 && onShowAll ? (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-1 min-h-9 w-full rounded-lg px-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Show {hiddenCount} more
        </button>
      ) : null}
    </div>
  );
}

function ProjectRow({
  project,
  activeId,
  active,
  expanded,
  pendingId,
  onNavigate,
}: {
  project: ProjectChatSummary;
  activeId?: string;
  active: boolean;
  expanded: boolean;
  pendingId?: string | null;
  onNavigate?: (
    event: MouseEvent<HTMLAnchorElement>,
    channelId: string
  ) => void;
}) {
  return (
    <div
      className={cn(
        "group rounded-lg transition-colors",
        active || expanded ? "bg-muted/80" : "hover:bg-muted/60"
      )}
    >
      <div className="flex items-start gap-1">
        <Link
          href={`/chat/${project.hrefChannelId}`}
          aria-current={active ? "page" : undefined}
          onClick={(event) => onNavigate?.(event, project.hrefChannelId)}
          className="flex min-h-14 min-w-0 flex-1 items-start gap-2 rounded-lg px-2.5 py-2 text-sm"
        >
          <FolderKanban
            className={cn(
              "mt-0.5 size-4 shrink-0",
              active || project.unread > 0
                ? "text-primary"
                : "text-muted-foreground"
            )}
          />
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate",
                active || project.unread > 0
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground"
              )}
            >
              {project.projectTitle}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground/75">
              {project.unread > 0
                ? `${project.unread} new · ${project.hrefChannelName}`
                : project.hrefChannelVisitedAt
                ? `Resume ${project.hrefChannelName}`
                : `Open ${project.hrefChannelName}`}
            </span>
          </span>
          {project.unread > 0 ? (
            <UnreadBadge active={active} count={project.unread} />
          ) : null}
          <PendingHint pending={pendingId === project.hrefChannelId} />
        </Link>
        <ProjectPinToggle
          projectId={project.projectId}
          projectTitle={project.projectTitle}
          pinned={project.pinned}
          className={cn(
            "mr-1 mt-1",
            !project.pinned &&
              "opacity-70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          )}
        />
      </div>

      {expanded ? (
        <div
          className="chat-project-channel-panel grid overflow-hidden px-2 pl-8"
          data-state="opening"
        >
          <div className="min-h-0 space-y-1 overflow-hidden pb-2">
            {project.channels.map((channel, index) => (
              <div
                key={channel.id}
                className="chat-project-channel-item"
                style={
                  {
                    animationDelay: `${60 + index * 32}ms`,
                  } as CSSProperties
                }
              >
                <ProjectChannelRow
                  channel={channel}
                  active={channel.id === activeId}
                  pending={channel.id === pendingId}
                  onNavigate={onNavigate}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProjectChannelRow({
  channel,
  active,
  pending,
  onNavigate,
}: {
  channel: ProjectSidebarChannel;
  active: boolean;
  pending: boolean;
  onNavigate?: (
    event: MouseEvent<HTMLAnchorElement>,
    channelId: string
  ) => void;
}) {
  const Icon = PROJECT_ICONS[channel.name.toLowerCase()] ?? Hash;
  return (
    <Link
      href={`/chat/${channel.id}`}
      aria-current={active ? "page" : undefined}
      onClick={(event) => onNavigate?.(event, channel.id)}
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary font-medium text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      {channel.unread > 0 ? (
        <UnreadBadge active={active} count={channel.unread} />
      ) : null}
      <PendingHint pending={pending} />
    </Link>
  );
}

function Section({
  title,
  channels,
  activeId,
  pendingId,
  action,
  onNavigate,
}: {
  title: string;
  channels: ChannelListItem[];
  activeId?: string;
  pendingId?: string | null;
  action?: ReactNode;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  if (channels.length === 0 && !action) return null;
  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center justify-between gap-2 px-2.5 pb-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          {title}
        </p>
        {action}
      </div>
      {channels.map((c) => {
        const active = c.id === activeId;
        return (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            aria-current={active ? "page" : undefined}
            onClick={(event) => onNavigate?.(event, `/chat/${c.id}`)}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color,box-shadow]",
              active
                ? "bg-primary font-medium text-primary-foreground shadow-sm"
                : c.unread > 0
                  ? "font-semibold text-foreground hover:bg-muted"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Hash className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {c.unread > 0 ? <UnreadBadge active={active} count={c.unread} /> : null}
            <PendingHint pending={pendingId === c.id} />
          </Link>
        );
      })}
    </div>
  );
}

function DirectSection({
  messages,
  candidates,
  activeId,
  pendingId,
  onNavigate,
}: {
  messages: DirectMessageListItem[];
  candidates: DirectMessageCandidate[];
  activeId?: string;
  pendingId?: string | null;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  if (messages.length === 0 && candidates.length === 0) return null;
  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center justify-between gap-2 px-2.5 pb-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          Direct messages
        </p>
        {candidates.length > 0 ? (
          <NewDirectMessagePopover candidates={candidates} />
        ) : null}
      </div>
      {messages.map((message) => {
        const active = message.id === activeId;
        const photo = avatarSrc(message.image);
        const initials = message.name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <Link
            key={message.id}
            href={`/chat/${message.id}`}
            aria-current={active ? "page" : undefined}
            onClick={(event) =>
              onNavigate?.(event, `/chat/${message.id}`)
            }
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-[background-color,color,box-shadow]",
              active
                ? "bg-primary font-medium text-primary-foreground shadow-sm"
                : message.unread > 0
                  ? "font-semibold text-foreground hover:bg-muted"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-current/10 bg-background/15 text-[0.65rem] font-semibold">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{message.name}</span>
            {message.unread > 0 ? (
              <UnreadBadge active={active} count={message.unread} />
            ) : null}
            <PendingHint pending={pendingId === message.id} />
          </Link>
        );
      })}
    </div>
  );
}

function PendingHint({ pending }: { pending: boolean }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          <span className="sr-only">Loading conversation</span>
        </>
      ) : null}
    </span>
  );
}

function UnreadBadge({ active, count }: { active: boolean; count: number }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums",
        active
          ? "bg-primary-foreground/18 text-primary-foreground"
          : "bg-primary text-primary-foreground"
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
