---
title: "Tasks & the board"
category: "Work"
roles: [member, manager, admin]
keywords: [task, kanban, board, column, to do, in progress, review, done, drag, move, assign, priority, due date, earliest due first, task order, reschedule, edit task, move task to project, milestone, recurring, recurring schedule, google drive, task attachment, upload file, attach file, working folder, license obligation, printer payment, printing coordinator, proof review, approve proof, reply to printer, budget approval, approve, request changes, wip, time tracking, comment, mention, email task, forwarded email, meeting reminder, booking link, email assistant, task suggestion, learn from email, shared mou funding, invoice owner, delivery evidence, signing invoice, final invoice]
order: 30
summary: "My Work's Focus and Board views, moving cards, task fields, and time tracking."
---

Tasks are the unit of work. **My Work** brings your personal tasks and dated
obligations together in three views: **Focus**, **Board**, and **Agenda**. Each
project also keeps its own task board.

## My Work

- **Focus** is the daily workspace. It shows work already in progress, what
  needs attention next, farther-future work under **Later**, and tasks completed
  today. The summary reports open work, today's completions, and today's tracked
  time.
- **Board** shows all tasks assigned to you as **To do**, **In progress**,
  **Review**, and recent **Done** columns. Drag cards or use their status menu;
  filter by project or priority when the board is busy.
- **Agenda** orders tasks and operational deadlines by date. Managers can filter
  the same view to tasks, project deadlines, rights, or finance obligations.

Managers also see due **External follow-ups** in My Work. These are lightweight
email-response watches rather than tasks: open the thread, snooze the reminder,
or resolve it. A reply resolves the watch automatically.

Focus and Board include a timer control on each open task. Starting a different
task moves your active timer immediately; Focus shows its live elapsed time, and
the running task also remains visible in the app header. Status, timer, and drag
changes appear immediately while the server saves, and restore automatically if
saving fails.

## Tasks from email

When a project-linked printer sends an actual proof attachment and asks for
approval or review, Sastra identifies a task without another AI call. If exactly
one active teammate is addressed directly in **To**, the suggestion is assigned
to that person; people copied in **Cc** never imply assignment. For example,
email sent to Bora with a revised cover proof can suggest **Review revised cover
proof and reply to Stone**, linked to the project and with no invented due date.
The recipient gets an in-app notification, and the editable suggestion stays at
the top of **My Work** until they choose **Add task**, **Already done**, or
**Not a task**. Managers also see it in the correspondence thread's review
area.

When you deliberately forward an email to the shared capture mailbox, Sastra
can notice a concrete next step such as scheduling a meeting, replying,
following up, reviewing something, or sending a document. This runs alongside
specialized correspondence processing; an email can still produce a print
quote, project suggestion, or grant reminder when appropriate.

- If the original forwarded email is more than one calendar year older than
  the forward or capture date, Sastra does not create or suggest tasks from it.
  It still processes other useful correspondence information, such as project
  links, rights details, funding information, and print quotes.
- If your note above the forwarded message explicitly asks Sastra to create a
  task or reminder, it may create an undated, medium-priority task assigned to
  you. A manager or admin can explicitly delegate to another active teammate.
- If the work is only inferred from the original email, it appears at the top of
  **My Work** for review. Edit the task, notes, due date, priority, project, and
  (for managers) assignee, then choose **Add task**, **Already done**, or
  **Not a task**. The suggestion shows the original email date when Sastra can
  recover it from forwarded headers. **Already done** clears historical work
  without creating an open task and does not teach Sastra that the request was
  not a real task.
- Dates, urgency, people, and links are never invented. With no stated deadline,
  the task stays undated. A meeting or document link is saved only when it
  appeared exactly in the email.

Created tasks preserve their email provenance and any useful link. Managers can
open the source correspondence; ordinary members cannot see
the manager-only correspondence inbox. An automatically created task also has
**Undo automatic task**, which removes it after confirmation.

Sastra can learn narrow personal preferences from repeated accepts, edits,
dismissals, and undos. A proposed preference appears in My Work and does nothing
until you choose **Apply**. Patterns shared by several teammates are likewise
reviewed by an admin under **Settings ▸ AI** before becoming workspace rules.
Turn task suggestions or this learning off under **Settings ▸ Notifications ▸
Email assistant**.

## The board

Every project's Tasks tab is a **Kanban board** with four columns: **To do**,
**In progress**, **Review**, and **Done**. New tasks, moves, assignments, edits,
comments, time entries, and confirmed deletes appear immediately while saving.
If creating a task fails, the temporary card is removed and the task form reopens
with your input intact; other failed saves restore the prior task state.
Within each column, dated tasks are ordered from the earliest due date to the
latest, and undated tasks appear after dated work. A newly created or rescheduled
task therefore moves to the right place immediately instead of staying at the
bottom of the column.
Changing a due date also updates its **Overdue / due soon** label immediately,
without waiting for a page refresh. Starting or stopping a timer from a card,
task detail, My Work, or the header updates the other timer controls at once.

- **Move a card** by dragging it by its handle to another column — it saves
  automatically. Prefer the keyboard or a screen reader? Use the card's
  **⋯ menu ▸ Move to** instead.
- **In progress** and **Review** show recommended **WIP limits**. A WIP badge
  means there's more active work than recommended; a **stale review** badge means
  a task has waited in Review for three or more days.
- A **Pipeline** view offers the same work as a table/matrix if you prefer rows to
  columns.

## Task fields

When you create or edit a task you can set an **assignee**, **priority**, **due
date**, a **unit** (a chapter or section), a **milestone** flag, and
**dependencies** on other tasks. You can also create a task that isn't tied to any
project (a general or personal to-do).

For a one-off task, you can choose an optional Google Drive **working folder**
and **add or upload files while creating the task**. Files uploaded through the
Google picker are placed in Drive immediately, then linked to the task when you
choose **Create task**. Selected files stay in the form if task creation fails.
After creation, open the task to attach more existing Drive files, upload into
its working folder, change the folder, open an attachment, or remove the task's
link to it. **Upload file** opens the upload panel immediately and uses the task
folder, project folder, or shared-drive root as the destination, in that order.
Choose **Choose another folder** only when you want a different destination.
Tasks with files show the first filename as a direct **Open in Drive** shortcut
on task cards and rows; a count shows when more files are attached. In **Task
details**, the read-first **Task files** section keeps those links beside the
task description, while upload, folder, and removal controls stay under
**Manage Google Drive**.
Removing an attachment from Sastra does not delete the file from Google Drive.

Select an assigned task's title on **Dashboard** or in **My Work** to open its
details. The assigned owner can update the work there; managers and admins can
also edit tasks from project and workload views.

In **Task details**, choose **Mark task done** when the work is finished. Sastra
updates the status at once and also saves your other changes. If saving fails,
the task returns to its earlier status and your changes stay in the dialog.

Creating tasks for other people, or beyond your own, is a manager action.
Managers can also **set up a task plan with AI**, which generates chapter-by-stage
tasks for a book.

Reviewed printer invoices also create high-priority payment tasks. They are
assigned to the project's **Printing Coordinator** (or the manager handling the
invoice when no coordinator is assigned) and remain ordinary, reassignable
tasks. Their status follows the payment from action needed, to awaiting
confirmation, to paid. They carry a **Printer payment** badge on task lists.

Budget approval requests create a different kind of protected task. It carries
a **Budget approval** badge and links to the current quotation. Only its assigned
approver can choose **Approve** or **Request changes**, and a change request
requires a note. Ordinary Done, drag, reassignment, and delete controls are not
available because those actions do not represent an approval decision. Managers
and admins can still change its due date; for a current approval round, the
shared deadline updates on every approver's task and on the Budget approval card.
When the quotation changes, Sastra reopens the required approval work for the
new budget version while keeping completed rounds in the Budget tab's approval
history.

The same pipeline model supports each project type: book rows are chapters,
article-project rows are individual articles, podcast rows are episodes, and
video-series rows are videos. Video rows use the project's Original or
Translation workflow and do not inherit podcast-only audio stages.
Article collection templates create per-article translation, editing,
proofreading, optional audio/video, and publication tasks. Open **Pipeline view**
to compare every article across those stages.

## Your personal queue

Your **Dashboard** shows your assigned tasks in a **Do in this order** queue,
ordered by priority with overdue items first, plus a focus strip with the next
one to three tasks. Select a task title to edit it without leaving Dashboard.
The row reflects a changed due date immediately while it saves. Managers set
the queue order for you from **Workload**.

The active queue includes overdue and undated work, anything due in the next 30
days, and tasks already **In progress** or **In review**. Tasks due farther away
stay available under the collapsed **Later** section in Focus, so an annual
deadline does not crowd out work you can act on now. It moves into the active
queue automatically as its deadline approaches.

## Recurring tasks & scope

Recurring task **schedules** (for example a weekly report or an annual license
report) are shown below the project board, including when the project has no
ordinary tasks yet. This keeps current work ahead of future automation. Each
schedule shows its cadence, owner, next due date, and whether it came from a
license obligation.

Managers can **edit** the title, instructions, cadence, first due date, optional
end date, owner, and priority, or pause/resume the schedule. Editing a schedule
updates its unfinished occurrence and all future occurrences; completed tasks
remain unchanged as history. If the schedule came from a license obligation,
the matching obligation on the Rights tab is corrected too.

Generated task cards carry a **Recurring** badge. Editing one generated task
changes only that occurrence; use **Edit** on the recurring schedule to correct
future tasks. On books with more than one print run, a **Task scope** selector
switches the board between the whole title and a specific print run or reprint.

## Comments & @mentions

Open a task to see its **Comments**. Post an update, and **@mention** a teammate
(type **@** and pick a name) to notify them about it — the notification links back
to the task. If they have Workflow emails on, the mention email is queued right
away instead of waiting for their bundle or daily digest. See **@mentions**.

## Time tracking

If you turn on **auto-start time tracking** in **Settings ▸ Profile**, a timer
starts when you move a task into progress. Managers can export a time report from
Workload.

Shared MoU invoice tasks are workflow-managed. They use one invoice owner per
installment and appear in My Work and agenda. Change the owner on the agreement;
you can change the internal task due date in the task. Delivery evidence may be
required before invoicing. Generating a PDF or checking a task complete cannot
stand in for sending. Successful invoice sending completes the task and clears
overdue reminders. Paused invoice tasks do not generate overdue prompts.
