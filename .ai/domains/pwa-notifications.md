# Domain: pwa-notifications

Push subscriptions, notifications, presence, offline page, and browser instrumentation.

Read this when the task touches this domain. Use the file list as a starting map, then inspect the specific files you edit.

## Files

- `app/api/notifications/recent/route.ts`
- `app/api/presence/heartbeat/route.ts`
- `app/api/presence/route.ts`
- `app/api/push/public-key/route.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/push/unsubscribe/route.ts`
- `app/offline/page.tsx`
- `components/notifications/notification-bell.tsx`
- `components/notifications/notification-navigation.test.tsx`
- `components/notifications/notifications-list.tsx`
- `components/presence/presence-menu.tsx`
- `components/presence/presence-provider.tsx`
- `components/pwa/enable-push-flow.tsx`
- `components/pwa/pull-to-refresh.tsx`
- `components/pwa/push-nudge.tsx`
- `components/pwa/pwa-provider.tsx`
- `components/pwa/service-worker-register.tsx`
- `lib/db/schema/notifications.ts`
- `lib/db/schema/presence.ts`
- `lib/notifications/actions.ts`
- `lib/notifications/client-events.ts`
- `lib/notifications/email-policy.test.ts`
- `lib/notifications/email-policy.ts`
- `lib/notifications/email-queue.ts`
- `lib/notifications/email-worker.test.ts`
- `lib/notifications/email-worker.ts`
- `lib/notifications/index.ts`
- `lib/notifications/overdue.ts`
- `lib/notifications/push-gate.test.ts`
- `lib/notifications/push-gate.ts`
- `lib/notifications/push.ts`
- `lib/notifications/queries.ts`
- `lib/notifications/work-hours.test.ts`
- `lib/notifications/work-hours.ts`
- `lib/presence/actions.ts`
- `lib/presence/queries.ts`
- `lib/presence/status.test.ts`
- `lib/presence/status.ts`
- `lib/push/client.ts`
- `lib/push/keys.test.ts`
- `lib/push/keys.ts`
- `lib/push/setup-state.test.ts`
- `lib/push/setup-state.ts`
