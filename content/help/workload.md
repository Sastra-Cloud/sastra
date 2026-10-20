---
title: "Workload"
category: "Work"
roles: [manager, admin]
keywords: [workload, managers, next up, shared queue, no due date, undated task, priority order, capacity, reassign, reorder, queue, balance, hours, time report]
order: 44
summary: "Choose and order each person's shared Next up tasks without dates, balance load, and reassign work."
---

**Workload** is a manager view of every teammate's open tasks side by side. Use
it to balance load and decide what each person tackles next.

## Reading the columns

Each person's column shows their open tasks with counts for **WIP**,
**stale-review**, **overdue**, **this-week**, and **total**, plus their weekly
hours and tracked time, and any **stuck-risk** flag raised by standups. Dragging
to reorder or reassign a task moves it immediately while the
change saves; if saving fails, the task returns to its confirmed owner and
position.

## Ordering and reassigning

- Choose **Add to Next up** on the tasks a person should tackle next. These move
  into **Next up · manager order**, above **Other assigned work**. You can also
  choose Next up when creating a one-off task or from task details.
- **Drag a task** (or use the up/down arrows) within its group to order it. The
  assignee sees the same selected order on **Home** and **My Work ▸ Focus**, even
  for tasks without due dates. Home previews three; My Work shows the full
  selection. Choose a small set so the next action stays clear.
- **Remove from Next up** returns a task to the standard queue. It stays assigned
  and open. Due dates and priority labels are separate: neither silently changes
  your selected sequence. Real deadline counts remain prominent for the assignee.
- **Drop a task onto another person** to reassign it to the end of that person's
  standard queue. Its previous Next up selection is cleared; choose Add to Next
  up for the new owner when appropriate. Source-managed tasks keep their usual
  reassignment restrictions.

There is one shared order per assignee, editable by managers and admins across
projects. The column shows who last changed the queue. If another manager changes
it while you are editing, Sastra restores the confirmed state, loads the latest
queue, and asks you to try again. Saving affects only that person's controls;
other teammates' queues remain available. Reordering does not reset task activity
or make an old review look new.

## Time report

**Export time report** downloads a `.xlsx` of tracked time across the team.

## On wide screens

Each person's workload card keeps the same size. A wide screen fits more cards in
a row, so you can compare more people without scrolling. The order of people and
the order of their tasks do not change.
