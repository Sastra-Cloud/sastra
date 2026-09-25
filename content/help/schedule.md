---
title: "Schedule"
category: "Work"
roles: [manager, admin]
keywords: [schedule, roadmap, timeline, gantt, capacity, slots, start date, estimated duration, planned finish, deadline, auto-schedule, reschedule, drag, resize, projects at once, over capacity, portfolio plan, when will it finish, shift tasks, team capacity, role capacity, role capacity per path, bottleneck, translator, editor, proofreader, layout, marketing, video series, original video, translated video, creative path, utilization, who is busy, staffing, staffing supports, per path staffing, work path, project type capacity, books at once, articles podcasts and video, parallel paths, provisional, planned back from due date, ends on due date, overdue, will miss deadline, behind schedule, red bar, green bar, no start date, due date but no start, over-committed, can't meet deadline]
order: 45
summary: "Plan when each project runs and who staffs it — realistic starts, durations, role capacity, and deadlines."
---

**Schedule** (managers) is where you plan *when each project actually runs*, as a
roadmap across the whole portfolio. It separates two things the tool used to
treat as one:

- The **plan** — a realistic **start date** and **estimated duration**. Together
  these are a project's planned window (start → planned finish).
- The **deadline** — the contractual "must finish by" date from a license or MoU
  (or a placeholder). Shown as a ◆ marker on each bar.

This matters because imported agreements often set the same far-future deadline
for a whole batch (e.g. "within 18 months"), which makes every project look due
at once. Giving each a realistic start and duration spreads them out honestly.

## Work paths

The roadmap is split into **work paths** — groups of project types that run in
parallel because they use different people and stages. By default **Books** are
their own path and **articles, podcasts, and video series** share the
**Creative media** path because much of the same staff handles them. Each path
has its **own "how many at once,"** its own load
ribbon, and its own auto-schedule, so a full book slate doesn't block the
Creative media line, and vice-versa. Each project still uses its own project
type's typical duration.

Define the paths — their names, which project types belong to each, and each
path's concurrency — in **Settings ▸ Workspace ▸ Planning capacity**. A project
with no type set is treated as a **book**, so untyped projects appear on the
Books path; fix a miscategorized project by setting its type in **Project
settings ▸ Project type**.

## Reading a path

Each project's bar is **anchored to its effective deadline**: the rights
agreement's contractual **complete-by date** when one exists, otherwise the
project's due date. This is the same date used by the due-date sort on
**Projects**. A project that has a deadline but no start set is **planned backward
from it** (start = deadline − typical duration), so the **bar ends exactly on the
deadline** — a dashed
(provisional) bar. A project with its own start set runs from that start for its
duration.

Every bar is then colored by whether it can actually meet its due date:

- **Green** — it still fits before the deadline.
- **Red (overdue)** — it can't. For a planned (no-start) book that means the
  start it would need is already in the past; for a book with a set start it
  means its finish lands after the deadline. The bar still ends on (or extends
  past) the due date so you can see how far behind it is.

The **path-load ribbon** shows how many of the path's projects would have to run at
once to hit every due date; where that rises above the "at once" (the dashed
**slots** line) you're over-committed. So the picture is: bars pinned to real
deadlines, red where they can't be met, and a load ribbon showing the squeeze.

- **Drag a bar** to move a project's start, or **its right edge** to change the
  duration — the bar re-colors to show whether it still meets the due date.
- **Edit a project** (the pencil) to type an exact start date and duration; on a
  provisional bar it pre-fills the back-scheduled start — Save to confirm it.
- **N at once** (per path) sets that path's capacity; raising it lets more
  overlap. When your staffing is set up, **Staffing supports N** appears — click
  it to adopt the concurrency your people can actually cover on that path.
  Otherwise **Configured N** resets it to the value saved in Settings.

When you move a project, Sastra asks whether to **shift that project's tasks and
phases** by the same amount. Tasks with manually set due dates are never touched.

## Auto-schedule

Each path has its own **Auto-schedule** that staggers *that path's* projects into
its open slots, earliest-deadline first, so no more than its capacity run at
once. It's a **preview** — review it, then **Save** or **Discard**. Anything that
still lands after its deadline stays flagged, so you can extend that deadline, add
a slot, or reprioritize rather than pretend it fits.

## Team capacity

The **Team capacity** tab answers "who can do the work, and where does the
pipeline jam?" — **per work path**. A project flows through roles (translation →
editing → proofreading → layout → marketing), and each role has only so many
people, who may staff one path or both. The tab shows, **for each path**, how
many projects each role can handle **at once** (everyone on that path combined)
versus how many need it **now**, and flags that path's **bottleneck** — its
tightest role, which is the real limit on how many projects that path can run at
a time. It also lists each person's roles and load per path, so you can see who
has room and who's booked up. Because paths run in parallel, Books can be jammed
while the Creative media path still has room. Roadmap rows show the
project type, and video rows also show **Original** or **Translation**.

Set this up in **Settings ▸ Team ▸ Role capacity**: a grid **per work path**
where managers enter how many projects each person carries at once in each role
on that path (blank = they don't do it there). Someone might do 2 book
translations at once but only 1 for articles, podcasts, and video series. Typical stage durations
per role live in **Settings ▸ Roles**. Once set, each path on the roadmap shows a
**"Staffing supports N"** suggestion — the concurrency your people can actually
cover on that path — and assigning someone to a role on a project shows whether
they still have room on that project's path.

## Everywhere else

A project's start and estimated duration are also editable from **Project
settings** on the project page. The planned finish (not the placeholder deadline)
is what drives the **capacity model** and the **completion-date planner** on
funding proposals, so a realistic schedule makes those estimates realistic too.
The completion-date planner is **path-aware**: it counts only the projects on the
same work path against that path's slots, so a book's suggested date isn't pushed
out by the Creative media queue. Work paths, per-path concurrency, and duration
defaults per project type all live in **Settings ▸ Workspace ▸ Planning
capacity**.

The **Sastra Assistant** can give the same live recommendation while you are on
a project page. Ask when the current project can realistically start or finish;
the answer uses this path capacity, its running-project finish dates, duration
default, dated commitments, and overdue or unscheduled workload. A manager can
then ask it to set the selected funding-proposal completion date, subject to the
normal approval preview.
