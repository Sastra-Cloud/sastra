---
title: "Podcasts, videos & episodes"
category: "Publishing"
roles: [member, manager, admin]
keywords: [podcast, episode, video series, videos, testimony videos, original video, translated video, production mode, script, concept, outline, translate, translation, audio, video, owner, assignee, stage, bulk, schedule, deadline, milestone, publish]
order: 75
summary: "Plan podcasts and original or translated video series through their project-wide production workflows."
---

Podcast and **video series** projects replace the Print tab with an **Episodes**
tab (labeled **Videos** for a video series). Books and articles do not have this
tab. A podcast is audio-first with optional video. A video series has one
project-wide **production mode** — **Original** or **Translation** — and every
video follows that mode. The mode appears on project cards, the project header,
Project settings, and Schedule.

Owner, target date, publishing status, video requirement, stage assignee,
deadline, and task status change immediately while saving. Bulk workflow changes
show progress because individual episodes can succeed or fail independently.
The current-step badge, progress bars, readiness warnings, published milestones,
and summary counts recalculate from those immediate changes; a failed save
restores the previous row and totals.

## The production workflow

Podcast episodes use linked tasks for these standard work steps:

1. Translate script
2. Edit and approve translation
3. Record audio
4. Edit and master audio
5. Produce video
6. Review and approve video
7. Schedule episode

Podcast production is sequential: translation approval unlocks audio recording, the
finished audio master unlocks video production, and video approval unlocks
scheduling. If video is not required, the finished audio master unlocks
scheduling directly. An episode is **Ready to schedule** only after every
required earlier stage is complete.

An **Original** video uses this six-step workflow:

1. Create concept and outline
2. Write script
3. Review and approve script
4. Produce video
5. Review and approve video
6. Schedule video

A **Translation** video uses this five-step workflow:

1. Translate script
2. Edit and approve translation
3. Produce video
4. Review and approve video
5. Schedule video

Video series do not create separate podcast recording or audio-mastering stages.
Audio that belongs inside a video can be tracked in the video-production task or
as a custom task.

The **Current step** label on each episode is calculated from these tasks. An episode
is **Not started** while its first translation task is still **To do**;
**Translating** appears only after that task moves to **In progress** or
**Review**. The same distinction applies later in the workflow: "Ready for"
labels mean the next stage is waiting to begin, while labels such as
**Recording audio**, **Mastering audio**, and **Producing video** mean that
work has actually started.

Each work step is a normal task with its own assignee, deadline, and task status:
**To do**, **In progress**, **Review**, or **Done**. The episode's **Current
step** is a read-only summary derived from those tasks, so there is no second
status to keep in sync. Completing production tasks does not publish an episode
or send any content externally.

If an episode is missing one or more standard stage tasks, the tab shows
**Setup incomplete** instead of calculating misleading progress. Managers can
use **Repair tracking** to create only the missing tasks without changing
existing task work or sending historical assignment alerts.

Because stages are normal tasks, they also appear in Tasks, Home, Workload,
assignee queues, overdue reminders, and project blockers.

## Owners and stage assignees

The **episode owner** is accountable for the complete episode. Each stage task
can have a different assignee, such as a translator, editor, audio producer, or
video reviewer.

Managers and admins can assign owners, stage assignees, dates, and publishing
states. A member can update the status of a stage assigned to them, but cannot
reassign production work or change workflow defaults.

Expand an episode row to see its stage checklist, dependency state, assignee,
due date, and link to the full Tasks board.

## Target dates and backward planning

The episode's **Target** date is its intended publication date. When a manager
sets or changes it, unfinished stage deadlines are calculated backward using
the project's workflow offsets. A date manually changed on an individual task
is preserved during later rescheduling, and completed task dates are not moved.
Workflow settings keep earlier steps due on or before the steps that follow, so
the deadline plan cannot contradict the production sequence.

Managers can open **Workflow** to set each active stage's default assignee and
choose how many days before publication that stage is due. Podcast managers can
also choose whether video is required by default and override it per episode.
Video series always require video; change Original vs Translation in **Project
settings ▸ Project type**. Changing mode asks for confirmation, removes only
untouched obsolete generated tasks, and preserves assigned, edited, commented,
timed, or file-backed work as ordinary tasks.

## Filters and bulk updates

Filter episodes or videos by current production step, owner, stage assignee,
overdue or unassigned work, title, or publication window. Podcasts can also be
filtered by video requirement.

Managers can select individual rows, Shift-select a range, or select every
episode currently matching the filters. The bulk toolbar can:

- assign an episode owner;
- move production to a current step by applying a consistent preset to the episode's
  underlying stage tasks;
- assign one work step to a project member;
- fill unassigned work steps from project defaults;
- set one target date or a repeating publication cadence; and
- require, skip, or inherit the project's video setting.

The confirmation step shows how many episodes and stage tasks may change. If
one episode fails, successful updates remain saved and the result reports the
partial failure. Moving an episode backward to an earlier production step
resets its later stage tasks, so review the affected task count before
confirming. Scheduled and published episodes keep their historical production
state and are not changed by this bulk action.

## Scheduling, publishing, and milestones

The publishing lifecycle remains **draft → scheduled → published**. Production
readiness is advisory: a manager must explicitly mark the episode scheduled or
published. Podcast published-count milestones and episode-triggered MoU payments
count only episodes actually marked **published**, not episodes that merely
completed production. Video series do not use the podcast 52/104 milestones or
their finance trigger.
