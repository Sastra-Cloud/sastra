---
title: "Notifications"
category: "Communication"
roles: [member, manager, admin]
keywords: [notification, bell, alert, bell not updating, idle, paused, email, bundled email, daily digest, immediate email, digest time, project-first digest, preheader, push, web push, quiet hours, work hours, unsubscribe, stop workflow emails, stop standup emails, mention, overdue task, due date changed, reschedule, stale notification, enable notifications, install, add to home screen, test notification, devices, blocked, badge, app icon badge, unread count, number on icon, email assistant, task suggestions, proof review, task learning, forwarded email, shared mou funding, invoice owner, delivery evidence, signing invoice, final invoice]
order: 105
summary: "The bell, bundled or daily notification email, email categories, and web-push scheduling."
---

Notifications keep you posted about work that needs you. The **bell** in the top
bar shows **task assignments**, **@mentions**, and **critical-blocker** alerts.
Routine captured email stays in **Correspondence**, so it does not crowd out
these work alerts or increase the bell number.
Opening or marking notifications read updates the bell and list immediately. If
the server cannot save the read state, the unread marker returns with an error.
The bell checks for new notifications every 20 seconds while you use Sastra. If
you stop typing, clicking, or scrolling for 10 minutes, it stops checking. It
catches up as soon as you come back. Chat and the online dots work the same way.
Push notifications still reach you while it is paused.

When a task due date changes, Sastra removes the old overdue alert from the bell
and notification history, whether it was read or unread. Future overdue reminders
are calculated from the replacement date. If someone else changes the due date
of a task assigned to you, you receive a new notification with the replacement
date through your enabled channels; edits you make to your own deadline stay
quiet. An email that was already delivered remains a historical message, so a
later teammate change is communicated with a new update rather than altering the
old email.

## Choosing what reaches you

In **Settings ▸ Notifications** you decide which events also **email** you, and
you can set up **web-push** (browser/PWA) notifications.

The **Email assistant** section controls tasks found in captured messages,
including direct proof-approval requests and mail you deliberately forward to
the capture mailbox. Turn off **Suggest tasks from email** to stop both automatic
and review-first task detection. Turn off **Learn from my
task decisions** to keep your accepts, edits, dismissals, and undos out of the
personal and shared preference-learning pass. Turning learning off does not
remove rules you previously approved; retire an active personal rule from **My
Work**.

Notification email has three frequency choices:

- **Bundled** (the default) collects nearby updates into one message, usually on
  the next five-minute boundary.
- **Daily digest** sends one summary at your chosen time Monday–Friday, using
  your profile timezone. Weekend updates wait until Monday; in-app and push
  alerts remain available in the meantime.
- **Immediate** sends one email per notification through the minutely delivery
  worker.

Direct **@mention** emails are the exception to this schedule. When Workflow
emails are on, Sastra queues each mention right away so a direct request does
not wait for a bundle or daily digest.

Bundles and daily digests are organized by project. The project with the newest
update appears first, and each project’s items are newest-first. Updates that do
not belong to a project appear under **Workspace**; completed summaries appear
under **Standups**. The subject is **N new Sastra updates** for a bundle and
**Your Sastra digest: N updates** for a daily message. A short hidden preview
summarizes the event mix, such as overdue tasks, assignments, and standup
summaries.

Digests show up to 50 details and link to **View all notifications** for any
remainder. Reading an alert before its email is sent removes that item from the
pending email. Empty digests are not sent. Immediate emails use the alert title
as the subject and send one alert per message.

The category switches are independent of frequency:

- **Workflow emails** cover assignments, task readiness and deadlines,
  mentions, replies, approvals, and weekly deadline summaries.
- **Standup digest emails** cover completed standup summaries. Standup reminders
  remain in-app and push-only.

AI correspondence review suggestions are in-app and appear on the Home.
They do not send push by default; turn on **Correspondence review suggestions**
under **What to send** if you want immediate alerts for possible projects,
counterparties, grant reminders, and email task suggestions. Standup reminders
and critical-blocker fan-out remain in-app/push-only. Essential account mail such as
invites, authentication, password resets, and magic links is always sent.
Explicitly sent correspondence and finance/print mail also stays outside the
notification-email schedule.

An **external follow-up due** alert is sent once to the responsible manager when
a project-linked outbound email has not received a reply by the configured
business-day interval. It is in-app/push-only. Snoozing schedules a new reminder;
an inbound reply or **Resolve** clears the active alert.

## Turning on push

Tap **Turn on notifications** on this device and allow the browser prompt. The
page is device-aware: on iPhone or iPad it first walks you through adding Sastra
to your Home Screen (a requirement on iOS), and if notifications were previously
blocked it shows how to unblock them. A **Turn on notifications** card also
appears on the Home until you're set up or dismiss it. See *Install the app
& turn on notifications* for the full walkthrough.

Once a device is registered it appears under **Devices receiving push**, with a
**Send test notification** button to confirm delivery (the test ignores your
schedule so it always arrives) and a way to remove devices you no longer use.

When Sastra is installed to your Home Screen (iOS 16.4+) or as an app (Chrome on
Android/desktop), the app icon also shows a **number badge** with your unread
count. It goes up when a push arrives and clears as you read notifications or
tap **Mark all read**.

## Choosing when push arrives

- **Quiet hours** and **work hours** so alerts respect your day.
- **Push only when active**, or **pause** notifications entirely.

These apply to push only, in your profile timezone; in-app and email are
unaffected. Turning off an email category does not turn off push.

Every notification email includes **Manage notification settings** and a clear
category-aware stop link: **Stop workflow emails**, **Stop standup emails**, or
**Stop notification emails** for a mixed message. Turning off one category does
not affect the other.
Captured email appears in **Correspondence** instead of creating a routine bell
or push alert. If an email creates specific work, such as a task suggestion,
review request, or external follow-up, that work can still create its own alert.

A **possible new project** notification opens a review screen where you create or
dismiss each project the email suggests (one email can suggest several); the
suggestions stay there until you act on them, even after you've read the
notification.

Shared MoU funding reviews notify eligible project creators in-app and by permitted
push, without intake email. Installment readiness notifies the invoice owner and
other eligible creators, including a creator who triggered readiness themselves.
Recipients are deduplicated. The notification links to the agreement and explains
the next action. PDF generation does not repeat the readiness notification.
Invoice sending and receipt recording create separate updates. Workflow email
follows notification preferences. Paused invoice work suppresses overdue prompts.
