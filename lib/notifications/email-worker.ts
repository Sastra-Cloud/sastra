import type { NotificationEmailItem } from "@/lib/email/notification-digest";
import {
  notificationTypeSendsImmediately,
  type EmailDeliveryMode,
} from "./email-policy";

export const MAX_EMAIL_ATTEMPTS = 5;

export type ClaimedNotificationEmailItem = NotificationEmailItem & {
  batchId: string;
  attemptCount: number;
  readAt: Date | null;
};

export type NotificationEmailClaim = {
  recipientId: string;
  email: string | null;
  isActive: boolean;
  isBot: boolean;
  workflowOptIn: boolean;
  standupOptIn: boolean;
  unsubscribeToken: string | null;
  mode: EmailDeliveryMode;
  batchId: string;
  items: ClaimedNotificationEmailItem[];
};

export type EmailWorkerStore = {
  listDueRecipientIds(now: Date): Promise<string[]>;
  claimRecipient(recipientId: string, now: Date): Promise<NotificationEmailClaim | null>;
  recheckClaim(claim: NotificationEmailClaim): Promise<NotificationEmailClaim>;
  markSent(queueIds: string[], now: Date): Promise<void>;
  markSuppressed(queueIds: string[], now: Date): Promise<void>;
  markFailed(
    items: ClaimedNotificationEmailItem[],
    now: Date,
    error: string
  ): Promise<{ retried: number; failed: number }>;
};

export type NotificationEmailSender = (input: {
  to: string;
  items: readonly NotificationEmailItem[];
  mode: EmailDeliveryMode;
  unsubscribeToken: string;
  batchId: string;
}) => Promise<void>;

export type EmailWorkerReport = {
  recipients: number;
  batches: number;
  sentItems: number;
  suppressedItems: number;
  retries: number;
  failures: number;
};

function currentCategoryEnabled(
  item: ClaimedNotificationEmailItem,
  claim: NotificationEmailClaim
): boolean {
  return item.category === "standup" ? claim.standupOptIn : claim.workflowOptIn;
}

export function sanitizeEmailQueueError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/https?:\/\/\S+/gi, "[redacted url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/** Framework-free worker orchestration, exercised with injected queue/SMTP fakes. */
export async function runNotificationEmailWorker({
  store,
  send,
  now = new Date(),
}: {
  store: EmailWorkerStore;
  send: NotificationEmailSender;
  now?: Date;
}): Promise<EmailWorkerReport> {
  const report: EmailWorkerReport = {
    recipients: 0,
    batches: 0,
    sentItems: 0,
    suppressedItems: 0,
    retries: 0,
    failures: 0,
  };
  const recipientIds = await store.listDueRecipientIds(now);

  for (const recipientId of recipientIds) {
    const claimed = await store.claimRecipient(recipientId, now);
    if (!claimed || claimed.items.length === 0) continue;
    // Read state, category choices, and recipient eligibility can change after
    // the atomic claim. Refresh them at the final boundary before rendering.
    const claim = await store.recheckClaim(claimed);
    if (claim.items.length === 0) continue;
    report.recipients += 1;

    const recipientEligible =
      claim.isActive && !claim.isBot && Boolean(claim.email && claim.unsubscribeToken);
    const suppressed = claim.items.filter(
      (item) => !recipientEligible || item.readAt !== null || !currentCategoryEnabled(item, claim)
    );
    if (suppressed.length > 0) {
      await store.markSuppressed(suppressed.map((item) => item.queueId), now);
      report.suppressedItems += suppressed.length;
    }

    const suppressedIds = new Set(suppressed.map((item) => item.queueId));
    const eligible = claim.items.filter((item) => !suppressedIds.has(item.queueId));
    if (eligible.length === 0 || !claim.email || !claim.unsubscribeToken) continue;

    const immediateItems = eligible.filter((item) =>
      notificationTypeSendsImmediately(item.type)
    );
    const scheduledItems = eligible.filter(
      (item) => !notificationTypeSendsImmediately(item.type)
    );
    const groups: Array<{
      items: ClaimedNotificationEmailItem[];
      batchId: string;
      mode: EmailDeliveryMode;
    }> = claim.mode === "immediate"
      ? eligible.map((item) => ({
          items: [item],
          batchId: item.queueId,
          mode: "immediate",
        }))
      : [
          ...immediateItems.map((item) => ({
            items: [item],
            batchId: item.queueId,
            mode: "immediate" as const,
          })),
          ...(scheduledItems.length > 0
            ? [{ items: scheduledItems, batchId: claim.batchId, mode: claim.mode }]
            : []),
        ];

    for (const group of groups) {
      report.batches += 1;
      try {
        await send({
          to: claim.email,
          items: group.items,
          mode: group.mode,
          unsubscribeToken: claim.unsubscribeToken,
          batchId: group.batchId,
        });
        await store.markSent(group.items.map((item) => item.queueId), now);
        report.sentItems += group.items.length;
      } catch (error) {
        const result = await store.markFailed(
          group.items,
          now,
          sanitizeEmailQueueError(error)
        );
        report.retries += result.retried;
        report.failures += result.failed;
      }
    }
  }

  return report;
}
