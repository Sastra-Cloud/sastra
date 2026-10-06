import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn().mockResolvedValue({ user: { id: "manager" } }) }));
vi.mock("@/lib/workspace/module-guard", () => ({ requireWorkspaceModule: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/email/draft-store", () => ({ getEmailDraftForUser: vi.fn() }));
import { listSponsorships } from "./queries";
it("qualifies aggregated totals when joining invoices with their own amount column", async () => {
  await listSponsorships();
  const [query] = mocks.execute.mock.calls[0];
  expect(query).toContain('coalesce("sponsorship_totals"."amount", 0)');
  expect(query).toContain('coalesce("sponsorship_totals"."copies", 0)');
  expect(query).toContain('coalesce("sponsorship_received"."received", 0)');
});
