---
title: "Settings"
category: "Settings"
roles: [member, manager, admin]
keywords: [file space, storage, storage full, out of space, upload limit, your plan, manage plan, people limit, billing address, partner address, invoice description, settings, setup, profile, timezone, languages, currency, invoice issuer, payment instructions, invoice numbering, organization donation fee, organization fee, admin fee, donation deduction, net available, templates, avatar, team, invite, roles, super admin, publishers, printers, email, default cc, cc recipients, outbound email defaults, dictionary, voice, ai, model, budget, costs, usage, cloudflare, r2, openrouter, ai key, api key, openrouter key, credits, ai credits, credits used up, buy credits, branding, logo, workspace, organization identity, aliases, internal domains, mobile settings, planning capacity, projects at once, project duration, completion date planner, work path, work paths, creative path, project type capacity, books at once, articles podcasts and video, guidance, show helpful guidance, guided setup, tips, hide tips, expert mode, security, passkey, fingerprint, trusted browser, two factor, dependency audit, security updates, check again, run security check, GitHub Actions, fast AI pre-checks, pre-check, typesafe, jev, skip AI calls]
order: 140
summary: "Personal settings plus admin-controlled organization identity, publishing defaults, invoices, templates, integrations, and AI."
---

**Settings** holds your personal preferences and the workspace's shared
configuration. Which tabs you see depends on your role.

On a phone or tablet, tap the current section name below the Settings heading
to open the touch-friendly settings navigator, then choose another section.
From anywhere in the app, open the account menu from your avatar and name in the
top bar to reach Profile or Notification settings, change your presence status,
or sign out. On a phone or tablet, tap the avatar to open the same account menu.

Toggles, roles, team status, dictionary terms, and branding update immediately
while saving. A failed save restores the prior setting. Device push setup,
uploads, invitations, and sign-in show progress until their external result is
confirmed.

## Everyone

- **Profile** — your **name**, **timezone** (drives standup timing and due
  dates), **avatar**, the **Show helpful guidance** toggle, and the
  **auto-start time-tracking** toggle. Guidance turns the guided setup steps and
  on-screen tips on or off; leave it on while you are learning the app and turn
  it off once you know it well. You can also hide any single tip with its close
  button. Cropped profile photos are stored with the user account rather than
  workspace file storage, so they remain available if external attachment
  storage is interrupted.
- **Notifications** — email opt-ins, and turning on **web-push** on this device
  with a guided per-device setup (including iPhone Home Screen install), a test
  button, a list of your push devices, and scheduling. See *Notifications* and
  *Install the app & turn on notifications*.
- **Voice / Dictionary** — a shared terminology dictionary that shapes the AI's
  tone and how it spells names and terms. If dictation repeatedly returns the
  wrong spelling for a dictionary entry, edit that entry and add the incorrect
  spelling as a **heard-as alias**. Exact whole-word matches are corrected to the
  dictionary spelling after transcription; ambiguous aliases are not guessed.

## Managers

- **Team** — invite teammates, manage members (on Sastra Cloud, up to the number
  of people your plan includes), set each person's weekly hours,
  and set **Role capacity** — how many projects each person can carry at once in
  each role, **per work path** (Books, Creative media, …). Someone can staff
  one path, both, or neither, at different capacities. That per-path staffing
  drives each path's Team capacity / bottleneck view on the Schedule and makes
  due-date estimates account for who's available on that path.
- **Roles** — the **project role labels** (job-function labels with colors like
  translator or editor) used when assigning members to a project. These describe
  *who does what work*, not who may edit — that's the workspace role. Each role
  also has a **typical stage duration** (days) that drives the task-date cascade.
- **Publishers** — reusable rights holders and contacts; edit details, merge
  shorthand duplicates without losing project links, and export a rights report
  (`.xlsx`). See *Publishers directory*.
- **Partners** — a reusable directory of funding partners / MoU sponsors, each
  with multiple contacts; pick them on a project's quotation. See *Partners
  directory*.
- **Printers** — printer performance history: price per copy by quantity band,
  page-estimate accuracy, and quote and payment turnaround.
- **Email** — see the workspace's correspondence address (the one to CC or
  forward email to), how incoming email reaches Sastra (**Receiving email
  through**: Gmail, Resend, a webhook, or Off), whether Sastra can send as it,
  which email provider sends notifications, and the current outbound-email CC
  default. Admins get a
  shortcut from here to edit the default.
- **Standups** — create and edit standups. See *Standups*.

## Admins

- **Security** — add or remove passkeys and revoke every browser trusted for
  protected admin access. A passkey can use a fingerprint, face scan, device
  PIN, password manager, or hardware security key; Sastra never receives the
  biometric data. Email codes remain available as a fallback. A successful
  check lasts 60 days on that browser.
- **Workspace** — organization identity, aliases, internal domains, logo,
  languages, timezone, currency, ministry context, work schedule, publishing
  rates, print defaults, the business-day interval for external email follow-ups,
  the **default CC recipients for outbound email** prefilled on proposals,
  invoices, printer RFQs, finance requests, correspondence replies, and
  assistant email drafts,
  the **default organization donation fee** copied into new project and reprint
  budget scopes,
  **planning capacity** (the **work paths** — groups of
  project types that run in parallel, each with its own "how many at once" — plus
  typical duration per project type, used by the Schedule roadmap and the proposal
  completion-date planner), finance contacts, invoice issuer details, payment
  instructions, and invoice numbering. New projects inherit these defaults;
  existing project overrides are not rewritten. Correspondence and document AI
  also use active teammates and these settings to distinguish your organization
  from external partners, rights holders, and printers.
  On Sastra Cloud, admins also see a **Your plan** card here. It shows how many
  people your plan includes and how much **file space** you use. Pending
  invitations count as people; people you remove do not. File space counts
  attachments, imports, and wiki images and videos. When the space is full, new
  uploads stop with a message, and everything else keeps working. Delete files
  you no longer need, or use **Manage your plan** to get more space. Email that
  Sastra captures for you is always saved, even when the space is full.
- **Templates** — choose the workspace default and edit each reusable workflow's
  name, description, phases, durations, colors, tasks, default project roles,
  offsets, and per-unit fan-out. Templates can also be activated or retired;
  existing projects are unaffected. New workspaces include starting workflows
  for book translation, article collections, article audio/video, and podcast
  production; admins can adapt or retire any of them.
- **Costs** — review AI activity, estimated provider spend, workspace and
  per-user limits, and R2 storage and operation estimates. OpenRouter usage is
  marked as provider-reported; R2 and Workers AI costs are calculated from the
  app's records and current pricing. R2 storage includes ready workspace files
  plus private Wiki images and videos. On Sastra Cloud this page shows **AI
  credits** instead of dollars: how many of this month's credits are used, by
  which task and model, and per teammate. Credits refill on the 1st. The page
  warns when about 80% are used; when they are used up, AI features pause
  until the 1st or until you buy a credit pack from your account page. The
  workspace AI limit comes from your plan and cannot be edited here.
- **AI** — review what the assistant has learned and choose which model (a
  `provider/model` slug) powers each AI task. The **AI key** card holds the
  OpenRouter key Sastra sends AI work with. Paste a key that starts with
  `sk-or-` and choose **Save key**; it is stored encrypted, only its last four
  characters are shown afterwards, and it is used instead of any key set on the
  server. **Remove key** goes back to the server key, or turns AI off when there
  is none. On Sastra Cloud this card is not shown: AI runs on the plan's
  credits. Model routing stays in the collapsed **Advanced** section because it
  rarely needs changing. Cost reports and usage limits are in
  **Settings → Costs**.

## Super admins

A super admin has every admin permission and is the only role allowed to assign
or manage another super admin. **Settings → AI** shows super admins one extra
card, **Fast AI pre-checks**. When it is on, a small, fast AI model first checks
incoming email and assistant questions and decides whether the main AI needs to
run at all. Email that plainly needs no review, such as a newsletter or a
security alert from a software company, is skipped, which lowers cost. The
pre-check never accepts a suggestion on its own: everything a manager reviews
today is still reviewed. Turn the card off to go back to the standard behavior.
Its spending appears in **Settings → Costs** with the other AI providers. Ordinary admins cannot change or deactivate
admins or super admins. Sastra's
daily production-dependency audit also appears on **Security** for super
admins. The result for the version you run is published by the Sastra project
and read automatically; nothing needs to be configured. **Check again** fetches
the latest published result. When the deployment also has a narrowly scoped
GitHub Actions token, the same button starts the signed audit itself and the
card shows **Checking** until GitHub reports the real result. This action
cannot edit dependencies or push source code: security updates still require a
reviewed commit that passes CI. A newly failing audit
or a report overdue by more than 36 hours sends an
in-app notification, push notification when enabled, and direct operational
email only to active super admins. The same daily security monitor verifies
that Sastra's production PostgreSQL connection is using TLS and alerts active
super admins the first time it detects an unencrypted connection.

## First-run setup

After the first admin account is created, Sastra requires a short workspace
setup before opening the dashboard. Enter the organization name, internal names
and domains, primary source and target languages, timezone, territory, currency,
and a short ministry description. Advanced print, finance, invoice, and rate
defaults can then be completed in **Settings → Workspace**.

Provider passwords and API keys are never stored here. Configure email (SMTP or
Resend), storage, AI, correspondence, Google, push, and cron secrets in the
deployment environment; the related Settings pages only report connection
status and behavior.

## Two kinds of "role"

Don't confuse the two: your **workspace role** (member / manager / admin / super
admin) controls
**permissions**; a **project role label** (translator, editor, …) is just a job
label with no authority attached.

## Invoice payment details

In **Workspace → Invoice issuer**, set an optional **Invoice issuer name** separate
from workspace branding. When blank, invoices use the legal organization name,
then the organization name. The chosen name is preserved on each issued invoice.
Store your public issuer address, contact
details, payment instructions, and an optional separate PNG or JPEG invoice logo.
Set a payment request heading and enter payee and bank details as one
**label: value** per line. Account and routing numbers remain text, including
leading zeros. Save settings to apply the reviewed details to new invoices.

New PDFs use a letterhead, invoice number and date, Bill To block, and a
description/unit price/total table. Payment details appear on a separate payment
request page. Each issued invoice retains its reviewed issuer snapshot and PDF;
changing settings does not alter earlier invoices.

Funding partners have a reusable **Billing address** in their edit form. New
invoices can use that address, with per-invoice overrides. Changing a partner
address does not rewrite issued invoices.
