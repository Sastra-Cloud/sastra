import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const m = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: m }));
vi.mock("@/lib/email/thread-projects", () => ({
  ensureThreadProjectLink: vi.fn(),
}));
vi.mock("@/lib/email/known-project-match", () => ({}));
import { linkPrintThread } from "./email-link";
let saved: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  m.select.mockImplementation(() => ({
    from: (table: Parameters<typeof getTableName>[0]) => {
      const name = getTableName(table);
      if (name === "print_runs")
        throw new Error("Must not guess a newer production run for this reply");
      return {
        where: () => ({
          limit: async () => [
            {
              projectId: "project",
              runId: "early-estimate",
              contactId: "printer",
            },
          ],
          then: (resolve: (r: unknown) => unknown) => resolve([]),
        }),
      };
    },
  }));
  m.insert.mockReturnValue({
    values: (values: Record<string, unknown>) => {
      saved = values;
      return { onConflictDoUpdate: async () => undefined };
    },
  });
  m.update.mockReturnValue({
    set: () => ({ where: () => ({ returning: async () => [] }) }),
  });
});
it("keeps a printer reply on its original estimate request even when production runs exist and participant matching is unavailable", async () => {
  const result = await linkPrintThread({
    threadId: "thread",
    existingProjectId: "project",
    participantEmails: [],
    bodyText: "2000 copies at 0.75 per copy",
  });
  expect(result?.runId).toBe("early-estimate");
  expect(saved).toMatchObject({
    projectId: "project",
    runId: "early-estimate",
  });
});
