import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, notify, transaction } = vi.hoisted(() => ({ select: vi.fn(), notify: vi.fn(), transaction: vi.fn() }));
function query(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "limit", "orderBy", "for", "set"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}
vi.mock("@/lib/db", () => ({ db: { select, update: () => query([]), transaction } }));
vi.mock("@/lib/notifications", () => ({ notify, clearOverdueNotifications: vi.fn() }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: async () => ({ timezone: "UTC" }) }));
import { reevaluateSharedMouPayments } from "./readiness-engine";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((fn) => fn({ select, update: () => query([]) }));
});

describe("shared-payment notification context", () => {
  it.each(["received", "sent", "ready"])("names every covered project, amount, partner and owner for %s", async (state) => {
    const results = [
      [{ id: "payment", groupId: "group", administrativeProjectId: "hidden-anchor", groupName: "Memorandum of Understanding", counterparty: "Example Partner", amount: "4200.00", currency: "USD", trigger: "on_signing", invoiceAssigneeId: "owner" }],
      [{ id: "payment", groupId: "group", trigger: "on_signing", paidAt: state === "received" ? new Date() : null }],
      [{ title: "Article series", status: "active", allocationAmount: "6000" }, { title: "Video series", status: "active", allocationAmount: "2400" }],
      state === "ready" ? [] : [{ id: "invoice", status: "sent" }],
      [{ agreementTotal: "8400", reviewRequired: false }],
      [{ amount: "4200" }, { amount: "4200" }],
      [{ id: "creator", name: "Creator" }, { id: "owner", name: "Sam" }],
      [{ title: "Article series" }, { title: "Video series" }],
      [{ id: "owner", name: "Sam" }],
      [{ taskId: "task" }],
      state === "ready" ? [] : [{ id: "invoice" }],
    ];
    select.mockImplementation(() => query(results.shift() ?? []));
    await reevaluateSharedMouPayments({ groupId: "group" });
    expect(notify).toHaveBeenCalledTimes(2);
    for (const [notification] of notify.mock.calls) {
      expect(notification.project).toBe("Article series; Video series");
      expect(notification.body).toMatch(/USD\s+4,200.00/);
      expect(notification.body).toContain("Partner: Example Partner");
      expect(notification.body).toContain("Invoice owner: Sam");
      expect(notification.link).toBe("/agreements/group#payment-payment");
      expect(notification.title).toBe(`${state === "received" ? "Funds received" : state === "sent" ? "Invoice sent" : "Invoice ready"}: Memorandum of Understanding`);
    }
  });
});
