import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { chatChannels, projects } from "@/lib/db/schema";

export const DEFAULT_PROJECT_CHANNELS = [
  "General",
  "Translation",
  "Editing",
  "Layout",
  "Marketing",
] as const;

const DEFAULT_PROJECT_CHANNEL_SET = new Set(
  DEFAULT_PROJECT_CHANNELS.map((name) => name.toLowerCase())
);

export function defaultProjectChannelRows(projectId: string) {
  return DEFAULT_PROJECT_CHANNELS.map((name) => ({
    projectId,
    name,
    kind: "project" as const,
  }));
}

export function projectChannelOrderSql() {
  return sql`
    case lower(${chatChannels.name})
      when 'general' then 0
      when 'translation' then 1
      when 'editing' then 2
      when 'layout' then 3
      when 'marketing' then 4
      else 99
    end
  `;
}

async function normalizeExistingProjectChannels(projectId: string) {
  const existing = await db
    .select({
      id: chatChannels.id,
      name: chatChannels.name,
    })
    .from(chatChannels)
    .where(
      and(eq(chatChannels.projectId, projectId), eq(chatChannels.kind, "project"))
    )
    .orderBy(asc(chatChannels.createdAt));

  if (existing.length === 0) {
    await db
      .insert(chatChannels)
      .values(defaultProjectChannelRows(projectId))
      .onConflictDoNothing({
        target: [chatChannels.projectId, chatChannels.name],
      });
    return;
  }

  const names = new Set(existing.map((channel) => channel.name.toLowerCase()));

  if (!names.has("general")) {
    const legacyChannel =
      existing.find(
        (channel) => !DEFAULT_PROJECT_CHANNEL_SET.has(channel.name.toLowerCase())
      ) ?? existing[0];
    await db
      .update(chatChannels)
      .set({ name: "General" })
      .where(eq(chatChannels.id, legacyChannel.id));
    names.delete(legacyChannel.name.toLowerCase());
    names.add("general");
  }

  const missing = DEFAULT_PROJECT_CHANNELS.filter(
    (name) => !names.has(name.toLowerCase())
  );
  if (missing.length > 0) {
    await db
      .insert(chatChannels)
      .values(
        missing.map((name) => ({
          projectId,
          name,
          kind: "project" as const,
        }))
      )
      .onConflictDoNothing({
        target: [chatChannels.projectId, chatChannels.name],
      });
  }
}

export async function ensureProjectChatChannels(projectId: string) {
  await normalizeExistingProjectChannels(projectId);
}

export async function ensureAllProjectChatChannels() {
  const projectRows = await db.select({ id: projects.id }).from(projects);
  await ensureProjectChatChannelsForProjects(projectRows.map((project) => project.id));
}

export async function ensureProjectChatChannelsForProjects(projectIds: string[]) {
  const ids = [...new Set(projectIds)].filter(Boolean);
  if (ids.length === 0) return;

  const existing = await db
    .select({
      projectId: chatChannels.projectId,
      name: chatChannels.name,
    })
    .from(chatChannels)
    .where(
      and(
        inArray(chatChannels.projectId, ids),
        eq(chatChannels.kind, "project")
      )
    );

  const namesByProject = new Map<string, Set<string>>();
  for (const row of existing) {
    if (!row.projectId) continue;
    const names = namesByProject.get(row.projectId) ?? new Set<string>();
    names.add(row.name.toLowerCase());
    namesByProject.set(row.projectId, names);
  }

  for (const id of ids) {
    const names = namesByProject.get(id);
    if (!names || !names.has("general")) {
      await normalizeExistingProjectChannels(id);
      continue;
    }
    const missing = DEFAULT_PROJECT_CHANNELS.filter(
      (name) => !names.has(name.toLowerCase())
    );
    if (missing.length > 0) {
      await db
        .insert(chatChannels)
        .values(
          missing.map((name) => ({
            projectId: id,
            name,
            kind: "project" as const,
          }))
        )
        .onConflictDoNothing({
          target: [chatChannels.projectId, chatChannels.name],
        });
    }
  }
}
