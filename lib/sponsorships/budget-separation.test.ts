import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn() }));
import { listProjectActivity, listRecentActivity } from "@/lib/activity/queries";
import { listInvoices } from "@/lib/budget/queries";
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue({ rows: [] }); });
for (const [printRunId, includeAll] of [[undefined, false], ["00000000-0000-4000-8000-000000000002", false], [undefined, true]] as const) {
  it(`excludes sponsorship invoices from budget scope ${includeAll ? "all history" : printRunId ? "print run" : "project"}`, async () => {
    await listInvoices("00000000-0000-4000-8000-000000000001", printRunId, includeAll);
    const [query] = mocks.execute.mock.calls[0];
    expect(query).toContain('"invoices"."sponsorship_id" is null');
  });
}

for (const [surface, read] of [["project", () => listProjectActivity("00000000-0000-4000-8000-000000000001")], ["portfolio", () => listRecentActivity()]] as const) {
  it(`keeps sponsorship financial details out of member-visible ${surface} activity`, async () => {
    await read();
    const [query, params] = mocks.execute.mock.calls[0];
    expect(query).toContain('"activity_log"."entity_type" <>');
    expect(params).toContain("sponsorship");
  });
}
