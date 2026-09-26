---
title: "Getting started & roles"
category: "Getting started"
roles: [member, manager, admin]
keywords: [home, onboarding outcomes, next step, hidden tips, invite, invitation, seven days, sign in, login, magic link, 5 minutes, one-time link, password, password reset, one hour, roles, member, manager, admin, super admin, timezone, profile, account, save, saving, sync, retry, page error, page not found, spinner, mobile menu, navigation, today, work, management, workspace, pull to refresh, refresh, guidance, guided setup, tips, dismiss tip, coaching, checklist, across browsers, show helpful guidance, learn the app, passkey, fingerprint, two factor, security code]
order: 10
summary: "Start with Home, complete role-appropriate setup, find assigned work, and restore your personal guidance."
---

Sastra is an **invite-only** workspace for planning publishing and translation
projects. You can't sign yourself up — a manager or admin invites you, and then you set up
your account from the invite email.

For self-hosted installations, the first-administrator setup path is disabled during normal operation. It can
only be enabled temporarily by the deployment operator for a completely empty
workspace and is protected by a configured email and one-time setup token.

## Signing in for the first time

1. A manager or admin invites you from **Settings ▸ Team**. You receive an email naming
   the workspace, inviter, and role. The invitation expires after seven days.
   On Sastra Cloud, a plan includes a set number of people; when every place is
   taken, the invite screen says so and shows where to manage the plan.
2. Open the link and either set a **password** or request a **magic link**. A
   magic link can be used once and expires after 5 minutes.
3. Once you're in, open **Settings ▸ Profile** and set your **name** and
   **timezone**. Your timezone drives standup timing and how due dates are shown,
   so it's worth getting right. The default is Asia/Phnom_Penh.

If you forget your password, select **Forgot password?** on the sign-in page.
Enter your email, then open the reset link in the email. The link can be used
once and expires after one hour. Choose a new password with at least eight
characters. After the reset, sign in again on each device.

You can also select **Email me a sign-in link** to sign in without your password.
Unexpected invitations, magic links, and password resets can be ignored. They
do not change your account unless you open and complete them.

Admins can add a passkey under **Settings → Security** and then sign in with a
fingerprint, face scan, device PIN, password manager, or security key. Before
opening private donation data, an admin confirms with a passkey or a six-digit
email code. The browser stays trusted for 60 days, so this is not a daily
prompt.

## Your first steps

Home shows the next relevant step, with **Show all steps** to reveal the checklist.
Administrators confirm workspace defaults, create a project, invite a teammate,
and assign work. Saving workspace defaults confirms that step; existing project
overrides stay unchanged.

Members start with My Work and this guide. A task-completion step appears when
work is assigned, and a check-in step appears when they belong to an active
standup. Managers also get a direct link to an existing project's budget and
the schedule. If you have no assigned work, ask a manager for your first task.

Page visits only complete visit steps. Task completion, check-in participation,
and administrator setup steps are checked against saved outcomes. The checklist
disappears when complete; its close button intentionally hides it. Restore hidden
tips under **Settings → Profile → Show hidden tips again**, or turn off guidance
with **Show helpful guidance**. These preferences affect only your account.

## The four roles

Every person has one workspace role. Roles are hierarchical — a manager can do
everything a member can, an admin can do everything a manager can, and a super
admin can do everything an admin can.

- **Member** — work on your own tasks, chat, answer standups, upload files, and
  use the Assistant, Agenda, and Home.
- **Manager** — everything a member can, plus the **Overview** and **Workload**
  pages, editing **Rights**, **Budget**, and **Print**, running the **AI
  planner** and **document import**, reading **Correspondence**, and configuring
  the team, roles, publishers, printers, email, and standups.
- **Admin** — everything a manager can, plus monthly donation imports and
  project funding allocation under **Management ▸ Donations**, **Settings ▸
  AI** (choosing the model behind each AI task), and per-user assistant budgets.
- **Super admin** — everything an admin can, plus assigning or managing other
  admin-level accounts and receiving operational dependency-security alerts.
  Only a super admin can create or manage another super admin.

If you try to do something your role doesn't allow, Sastra tells you and points
you to ask a manager or admin. Many pages (like Rights and Budget) are visible to
everyone but only editable by managers.

## How changes save

Sastra applies ordinary changes immediately while it saves them in the
background. Moving or completing a task, changing a setting, marking an item
paid, or editing a record should update on screen without waiting for the
server. If saving fails, Sastra restores the last confirmed value and shows an
error; form text is kept so you can correct it or retry.

Work whose outcome cannot be assumed—uploads, document parsing, AI generation,
invoice creation, email, and other external actions—shows a named progress state
such as **Uploading…**, **Generating…**, or **Sending…**. Completion is only
shown after the service confirms it. Destructive actions still ask for
confirmation before disappearing.

## Finding your way around

The left sidebar is grouped by the kind of work you are doing:

- **Today** — Home, My Work, and Standups.
- **Work** — Projects, Chat, Assistant, and Correspondence for managers.
- **Management** — Overview, Schedule, and Workload for managers, plus
  Donations for admins.
- **Workspace** — Wiki, Settings, and Help.

At compact desktop widths the sidebar becomes an icon rail; pause over an icon
to see its label. Look for the small **?** icons around the app for tips on
individual fields. On **Help**, search stays available while you read. Use the
persistent topic list on desktop or the **Topics** button on mobile to move
between guides without scrolling back to the top.

## Guidance and guided setup

While you are learning, Sastra shows extra help: short **tips** on a screen and
**guided setup** steps that walk you through big tasks like starting a project,
a budget, or a print run. Guided setup always has a **Skip** link, and every tip
has a close button, so they never get in your way. When you know the app well,
turn all of it off in one place: **Settings ▸ Profile ▸ Show helpful guidance**.

If a page cannot load, **Try again** retries it without making you hunt for the
route. The recovery screen also links to Home and Help. A missing or stale
link offers the same safe destinations.

On a phone, tap the menu button to open the same grouped navigation with full
labels and touch-sized rows. Opening a different screen starts at the top of its
content; using your browser's Back or Forward button returns you to your prior
reading position. In-page links still move directly to the named section.

When you are at the top of a page, pull downward and release after **Release to
refresh** appears to reload the latest app and workspace data. Pull-to-refresh
stays inactive inside dialogs, menus, forms, and the Assistant so it does not
interrupt work in progress.

## Where the code comes from

Sastra is open-source software. The **Source** link at the bottom of the sidebar
(and on the sign-in screen) opens the exact code this installation runs, with
its version. Self-hosters can point it at their own copy.

## Your next step on Home

Home shows your next onboarding step. Choose **Show all steps** to see the checklist. Opening a page only completes a visit step. Finishing a task, answering a check-in, creating a project, inviting a teammate, and assigning work are checked against saved data.

Administrators start with workspace defaults, a project, a teammate, and assigned work. Members see check-in participation only when they belong to an active check-in. When no tasks are assigned, ask a manager to assign your first task.

In **Settings → Profile**, choose **Show hidden tips again** to restore your dismissed guidance and checklist. This affects only your account; saved work and visited steps are preserved.

Password sign-in and email-link requests show separate progress. After requesting a link, **Check your email** stays visible on the sign-in page.
