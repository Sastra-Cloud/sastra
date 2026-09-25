---
title: "Blockers & project health"
category: "Work"
roles: [member, manager, admin]
keywords: [blocker, waiting, dependency, pipeline, health, red, amber, green, at risk, overdue, stalled, recompute, status]
order: 40
summary: "What raises a blocker and how the red/amber/green health dot works."
---

A **blocker** is anything standing between a project and *done*. Sastra tracks
them automatically and rolls them up into a single **health dot** so you can spot
trouble quickly.

## What raises a blocker

- Missing or **overdue rights**.
- A **budget shortfall** — the amount raised is less than the total quote.
- A project **past its own due date** — a project still open after its target
  completion date is a critical blocker (health turns red), just like overdue
  rights. Completed and cancelled projects are exempt.
- **Overdue** tasks.
- **Stalled** tasks — in progress but untouched for five or more days.

An unfinished dependency does **not** raise a blocker by itself. In article,
podcast, and video pipelines, later stages normally wait for earlier stages. Sastra shows
that expected sequencing as **waiting** in the unit pipeline. If the earlier
task becomes overdue or stalls, that root task raises one attention item; the
overview can also show how many later stages are waiting on it.

## Reading attention on a project

The project overview shows a compact **Attention needed** panel with critical
and warning counts. It previews the highest-priority root issues and links to
the relevant task pipeline, Episodes/Videos, Rights, or Budget surface. When there are
more issues, use the grouped links instead of scanning a long repeated list.

## The health dot

Each project shows a health dot: **red** (critical), **amber** (warning), or
**green** (clear). Health recomputes on its own after you make changes and again
once a day. When a project first turns **red**, managers are notified. Managers
can also refresh a project's health manually from the overview.

There's nothing to "clear" by hand — resolve the underlying issue (obtain the
rights, raise the funding, finish or reschedule the task) and the blocker and
health update themselves.
