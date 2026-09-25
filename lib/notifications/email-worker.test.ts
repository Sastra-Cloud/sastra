import { describe, expect, it, vi } from "vitest";

import {
  runNotificationEmailWorker,
  sanitizeEmailQueueError,
  type EmailWorkerStore,
  type NotificationEmailSender,
  type NotificationEmailClaim,
} from "./email-worker";

function claim(
  recipientId: string,
  count: number,
  overrides: Partial<NotificationEmailClaim> = {}
): NotificationEmailClaim {
  return {
    recipientId,
    email: `${recipientId}@example.test`,
    isActive: true,
    isBot: false,
    workflowOptIn: true,
    standupOptIn: true,
    unsubscribeToken: `token-${recipientId}`,
    mode: "bundled",
    batchId: `batch-${recipientId}`,
    items: Array.from({ length: count }, (_, index) => ({
      queueId: `${recipientId}-${index}`,
      batchId: `${recipientId}-${index}`,
      attemptCount: 1,
      category: "workflow" as const,
      type: "task_assigned",
      title: `Item ${index}`,
      body: null,
      project: null,
      link: "/notifications",
      readAt: null,
      createdAt: new Date(Date.UTC(2026, 6, 14, 10, index)),
    })),
    ...overrides,
  };
}

function fakeStore(claims: NotificationEmailClaim[]) {
  const pending = new Map(claims.map((value) => [value.recipientId, value]));
  const sent: string[][] = [];
  const suppressed: string[][] = [];
  const failed: string[][] = [];
  const store: EmailWorkerStore = {
    listDueRecipientIds: async () => [...pending.keys()],
    claimRecipient: async (recipientId) => {
      const value = pending.get(recipientId) ?? null;
      pending.delete(recipientId);
      return value;
    },
    recheckClaim: async (value) => value,
    markSent: async (ids) => void sent.push(ids),
    markSuppressed: async (ids) => void suppressed.push(ids),
    markFailed: async (items) => {
      failed.push(items.map((item) => item.queueId));
      const terminal = items.filter((item) => item.attemptCount >= 5).length;
      return { retried: items.length - terminal, failed: terminal };
    },
  };
  return { store, sent, suppressed, failed };
}

describe("notification email worker", () => {
  it("combines five due rows for one recipient into one message", async () => {
    const fake = fakeStore([claim("alice", 5)]);
    const send = vi.fn<NotificationEmailSender>(async () => undefined);
    const report = await runNotificationEmailWorker({ store: fake.store, send });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].items).toHaveLength(5);
    expect(report).toMatchObject({ batches: 1, sentItems: 5 });
  });

  it("combines workflow and standup items but never combines recipients", async () => {
    const alice = claim("alice", 2);
    alice.items[1].category = "standup";
    const fake = fakeStore([alice, claim("bob", 1)]);
    const send = vi.fn<NotificationEmailSender>(async () => undefined);
    await runNotificationEmailWorker({ store: fake.store, send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0].items.map((item) => item.category)).toEqual([
      "workflow",
      "standup",
    ]);
    expect(send.mock.calls[0][0].to).not.toBe(send.mock.calls[1][0].to);
  });

  it("sends immediate mode as one message per row", async () => {
    const fake = fakeStore([claim("alice", 3, { mode: "immediate" })]);
    const send = vi.fn<NotificationEmailSender>(async () => undefined);
    const report = await runNotificationEmailWorker({ store: fake.store, send });
    expect(send).toHaveBeenCalledTimes(3);
    expect(report.batches).toBe(3);
  });

  it("sends a mention immediately without pulling other updates out of the bundle", async () => {
    const mixed = claim("alice", 2, { mode: "daily" });
    mixed.items[0].type = "mention";
    const fake = fakeStore([mixed]);
    const send = vi.fn<NotificationEmailSender>(async () => undefined);
    await runNotificationEmailWorker({ store: fake.store, send });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toMatchObject({
      mode: "immediate",
      items: [{ type: "mention" }],
    });
    expect(send.mock.calls[1][0]).toMatchObject({
      mode: "daily",
      items: [{ type: "task_assigned" }],
    });
  });

  it("suppresses read, opted-out, and inactive rows and sends no empty batch", async () => {
    const read = claim("read", 1);
    read.items[0].readAt = new Date();
    const optedOut = claim("opted", 1, { workflowOptIn: false });
    const inactive = claim("inactive", 1, { isActive: false });
    const fake = fakeStore([read, optedOut, inactive]);
    const send = vi.fn<NotificationEmailSender>(async () => undefined);
    const report = await runNotificationEmailWorker({ store: fake.store, send });
    expect(send).not.toHaveBeenCalled();
    expect(report.suppressedItems).toBe(3);
  });

  it("retries failures, stops at five attempts, and preserves the claimed batch id", async () => {
    const retry = claim("retry", 1);
    const terminal = claim("terminal", 1);
    terminal.items[0].attemptCount = 5;
    const fake = fakeStore([retry, terminal]);
    const send = vi.fn<NotificationEmailSender>(async () => {
      throw new Error("SMTP rejected person@example.test at https://secret.test/token");
    });
    const report = await runNotificationEmailWorker({ store: fake.store, send });
    expect(report).toMatchObject({ retries: 1, failures: 1 });
    expect(send.mock.calls[0][0].batchId).toBe("batch-retry");
    expect(sanitizeEmailQueueError(new Error("person@example.test https://secret.test"))).toBe(
      "Error: [redacted email] [redacted url]"
    );
  });

  it("does not send a claimed row twice when two workers race", async () => {
    const fake = fakeStore([claim("alice", 1)]);
    const send = vi.fn<NotificationEmailSender>(async () => undefined);
    await Promise.all([
      runNotificationEmailWorker({ store: fake.store, send }),
      runNotificationEmailWorker({ store: fake.store, send }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
