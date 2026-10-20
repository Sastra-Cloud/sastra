import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ select: vi.fn(), suggestions: vi.fn(), followUps: vi.fn(), correspondence: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/email/task-suggestions", () => ({ listPendingEmailTaskSuggestionsForUser: mocks.suggestions }));
vi.mock("@/lib/email/follow-ups", () => ({
  listMyExternalFollowUps: mocks.followUps,
  externalFollowUpEffectiveDueAt: (item: { snoozedUntil: Date | null; dueAt: Date }) => item.snoozedUntil ?? item.dueAt,
}));
vi.mock("@/lib/email/queries", () => ({ countThreadsNeedingReview: mocks.correspondence }));
import { getNavigationBadgeCounts } from "./badge-queries";

const captured = new Map<string, { sql: string; params: unknown[] }>();
const now = new Date("2026-10-20T01:00:00Z"); // Still October 19 in Los Angeles.

beforeEach(() => {
  vi.resetAllMocks();
  captured.clear();
  mocks.correspondence.mockResolvedValue(4);
  mocks.suggestions.mockResolvedValue([{ id: "reviewable-suggestion" }]);
  mocks.followUps.mockResolvedValue([
    { dueAt: new Date("2026-10-19T00:00:00Z"), snoozedUntil: null },
    { dueAt: new Date("2026-10-19T00:00:00Z"), snoozedUntil: new Date("2026-10-22T00:00:00Z") },
  ]);
  mocks.select.mockImplementation(() => {
    let table = "";
    const conditions: SQL[] = [];
    const query = {
      from(value: Parameters<typeof getTableName>[0]) { table = getTableName(value); return query; },
      leftJoin(_table: unknown, condition: SQL) { conditions.push(condition); return query; },
      innerJoin(_table: unknown, condition: SQL) { conditions.push(condition); return query; },
      where(condition: SQL) { conditions.push(condition); return query; },
      then(resolve: (rows: unknown[]) => void) {
        captured.set(table, new PgDialect().sqlToQuery(sql.join(conditions, sql` and `)));
        resolve(table === "tasks" ? [
          { status: "todo", assignedTo: "me", dueDate: "2026-10-19" },
          { status: "todo", assignedTo: "me", dueDate: "2026-10-20" },
        ] : [{ count: table === "chat_channels" ? 7 : 1 }]);
      },
    };
    return query;
  });
});

describe("personal badge queries", () => {
  it("uses workspace-local today, the reviewable queue, and only due manager follow-ups", async () => {
    expect(await getNavigationBadgeCounts({ id: "me", role: "manager" }, "America/Los_Angeles", now)).toEqual({
      dueTasks: 1, taskSuggestions: 1, followUps: 1, chat: 7, standups: 1, correspondence: 4,
    });
    expect(mocks.suggestions).toHaveBeenCalledWith("me");
    expect(mocks.followUps).toHaveBeenCalledWith("me");
  });

  it("never queries sensitive correspondence follow-ups for a member", async () => {
    const counts = await getNavigationBadgeCounts({ id: "me", role: "member" }, "UTC", now);
    expect(counts.followUps).toBe(0);
    expect(mocks.followUps).not.toHaveBeenCalled();
    expect(counts.correspondence).toBe(0);
    expect(mocks.correspondence).not.toHaveBeenCalled();
  });

  it("scopes unread messages to accessible live channels and excludes self, deleted and read messages", async () => {
    await getNavigationBadgeCounts({ id: "me", role: "member" }, "UTC", now);
    const chat = captured.get("chat_channels")!;
    expect(chat.sql).toContain('"chat_channel_members"."user_id" =');
    expect(chat.sql).toContain('"channel_reads"."user_id" =');
    expect(chat.sql).toContain('"chat_messages"."deleted_at" is null');
    expect(chat.sql).toContain('"chat_messages"."user_id" is null or "chat_messages"."user_id" <>');
    expect(chat.sql).toContain('"chat_messages"."id" > coalesce("channel_reads"."last_read_message_id"');
    expect(chat.params).toEqual(["me", "me", "me", "standup", "project", "completed", "cancelled", "general", "me"]);
  });

  it("counts only the viewer's open, active, answerable standups on the standup-local date", async () => {
    await getNavigationBadgeCounts({ id: "me", role: "member" }, "UTC", now);
    const standup = captured.get("standup_runs")!;
    expect(standup.sql).toContain('"standup_runs"."user_id" =');
    expect(standup.sql).toContain('"standups"."is_active" =');
    expect(standup.sql).toContain('"standup_runs"."channel_id" is not null');
    expect(standup.sql).toContain('at time zone "standups"."timezone")::date');
    expect(standup.params).toEqual(["me", "in_progress", true, now.toISOString()]);
  });
});
