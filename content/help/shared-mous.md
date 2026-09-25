---
title: "Shared MoUs"
category: "Publishing"
roles: [manager, admin]
keywords: [shared mou, shared agreement, completion group, collective completion, covered projects, allocation, agreement payment, invoice gate, receipt allocation]
order: 65
summary: "Manage multi-project MoUs with one collective completion gate, payment schedule, and receipt allocation."
---

A **Shared MoU** is a manager-only agreement group for funding that depends on
several projects together. Open **Projects ▸ Shared MoUs** to see each agreement,
its covered projects, reviewed allocation, collective completion progress,
payment schedule, invoices, receipts, and source document.

## When a group is created

Document import creates a Shared MoU only when a reviewed payment has an **on
completion** trigger and covers more than one selected project. Ordinary
single-project MoU schedules keep working on that project's Budget page.

Before committing a shared import, confirm that every selected project's
funding subtotal is its intended agreement share. The shares must add up exactly
to the agreement total.

## When a completion invoice is ready

A shared completion payment becomes ready only when:

1. every active covered project has project status **Completed**;
2. the payment's **earliest invoice date** is blank or has arrived; and
3. the payment has not already been invoiced or received.

The agreement page states what is still blocking the invoice, such as “4 of 5
projects complete · waiting on Ask Pastor John Volume 2.” Readiness is checked
when a project is completed or reopened, when the roster or schedule changes,
and by the daily scheduled job. Only one invoice task and notification is
created.

If a completed project is reopened before invoicing, the existing request is
preserved but marked **Invoice paused**. Invoice generation stays blocked until
the group is ready again.

## Changing covered projects

Use the audited membership controls on the agreement page to add, remove,
replace, or change a project's allocation. Every change requires a reason and
appears in membership history. The page warns when active allocations no longer
equal the agreement total.

A covered project cannot be removed or replaced after a dependent payment has
been invoiced or received. Use a correcting transaction instead of rewriting
the historical agreement roster.

## Recording a receipt

Mark the shared payment received once on the agreement page. The app allocates
that receipt across the covered project budgets in proportion to the reviewed
shares. Any leftover cents are distributed deterministically, so the project
allocations always equal the received amount exactly.

Each covered project's Budget page shows its allocated agreement share and the
allocated funding receipt. The shared payment schedule itself appears only on
the Shared MoU page.
