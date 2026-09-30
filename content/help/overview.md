---
title: "Team planning & portfolio overview"
category: "Work"
roles: [manager, admin]
keywords: [team planning, manager attention, portfolio summary, trends and capacity, confirmation dialog, confirmation modal, cancel action, overview, portfolio, managers, rag, health, velocity, capacity, timeline, report, export, attention, project update, AI recommendation, follow up, automation, cron, wiki search index, due date, target completion date, projects without a due date, schedule dates, print funding, funding review, coordination pass]
order: 42
summary: "Review the complete manager attention queue and portfolio, then open Schedule, Workload, or expanded analytics."
---

**Team planning** opens the portfolio Overview. Its **Schedule** and **Workload**
views keep the full timeline and capacity tools available. Members do not see
these manager pages.

## What it shows

- **Manager attention** is the complete list shared with Home's three-item
  preview: suggested project follow-ups, email reviews, missing target dates,
  print funding review, and coordination decisions. Suggestions still require
  review before changing anything.
- **Attention needed** shows current critical blockers, overdue projects, and
  people flagged at risk by standup digests. Empty categories are omitted.
- The sortable **portfolio table** keeps health, progress, funding, blockers,
  dates, forecasts, and rights together. On phones it uses project cards.
- **Coming due** lists money and rights deadlines.
- Expand **Portfolio summary** for health and financial totals, **Timeline
  preview**, **Trends and capacity**, **Recent activity**, or **Automations** for
  reference detail. Use **Open schedule** and **Review team workload** for the
  full planning views.

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
managers and admins see a prompt on the **Home** and the **Overview** that
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

Team planning groups **Overview**, **Schedule**, and **Workload**. Use its navigation to switch views. Team capacity remains inside Schedule. Existing bookmarks still work.

Schedule reports how many projects have enough dates for assessment. Projects missing dates are listed as needing dates and are not counted as having achievable deadlines.
