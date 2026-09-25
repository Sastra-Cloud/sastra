---
title: "Overview (portfolio)"
category: "Work"
roles: [manager, admin]
keywords: [confirmation dialog, confirmation modal, cancel action, overview, portfolio, managers, rag, health, velocity, capacity, timeline, report, export, attention, project update, AI recommendation, follow up, automation, cron, wiki search index, due date, target completion date, projects without a due date, schedule dates, print funding, funding review, coordination pass]
order: 42
summary: "The manager portfolio dashboard across all projects."
---

**Overview** is the manager command center across the whole portfolio. Members
don't see it; managers and admins use it to run the program.

## What it shows

- A **RAG health donut** (on-track / needs-attention / at-risk) and stat cards:
  active projects, overdue tasks, total still **to raise** across budgets, and
  critical blockers.
- **Attention needed** — critical blockers, overdue projects, and people flagged
  at-risk by standup digests.
- **Follow up from project updates** — unreviewed AI recommendations derived
  from new status updates, ordered by priority. Open the project to see the full
  reasoning and mark the advice reviewed.
- A sortable **portfolio table**, a **Coming due** list of money and rights
  deadlines, and a **timeline** across projects. The table sorts by **due date**
  by default (the next project due for completion on top; finished and undated
  projects sink to the bottom). On phones it collapses to a card list with a
  **Sort by** control.
- A **Projects without a due date** prompt when any live project is missing a
  target completion date.
- A **print funding review** prompt when a current book is not assessed, has no
  funding, is seeking funding, or is only partially funded. It opens Projects
  with the funding-review filter already applied; managers update each book in
  **Project settings ▸ Print plan and funding**. Mark an eBook-first project as
  **No printing planned yet** so it leaves the funding-review queue without
  changing the Print rights the organization may use later.
- A **coordination pass** warning when active work exceeds the team-size limit.
  Its action opens Projects, where managers use each project&apos;s **Tasks** area to
  assign the next step and **Overview** to review blockers and team capacity.
- A **velocity** trend (tasks completed per week), a **team-load** capacity
  heatmap, recent activity, and indicators for automation/cron health.

The existing daily assistant-reflection schedule also runs the project-update
review. Its automation health appears separately as **Project update review** so
managers can tell if update analysis is stale or failing without inspecting
Coolify.

**Wiki search index** reports whether published Wiki pages are being prepared for
Assistant search. A red or stale indicator means keyword or semantic indexing
needs attention; publishing and reading Wiki pages remain available.

**Agreement search index** reports whether MoU and License attachments are being
prepared for agreement questions. New uploads start immediately, while this
worker discovers older files and retries interrupted parsing or embedding. A red
or stale indicator means agreement search preparation needs attention; the
original files remain available to open or download.

## Projects without a due date

Live projects (planning, active, or on hold) with no target completion date are
invisible to the timeline, forecast, and "coming due" lists. When any exist,
managers and admins see a prompt on the **Dashboard** and the **Overview** that
opens a focused **Projects without a due date** screen. There you can set each
project's date inline — it saves immediately and drops off the list — or open the
project for its full settings. Completed and cancelled projects are ignored,
since they don't need a due date.

## Exporting

**Export report** downloads a portfolio spreadsheet (`.xlsx`) you can share
outside the app.


## Confirming actions

Actions such as deleting, discarding a draft, or sending a reviewed reply use
Sastra’s styled confirmation dialogs. Read the details, then choose the named
action button to continue. **Cancel**, Escape, or closing the dialog leaves the
action unapplied. Text-entry dialogs preserve the distinction between submitting
an optional blank field and cancelling. If you navigate away, pending dialogs
are cancelled. Browser-managed permission and installation prompts remain under
your browser’s control.
