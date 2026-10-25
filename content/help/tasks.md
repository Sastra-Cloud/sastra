---
title: "Tasks & the board"
category: "Work"
roles: [member, manager, admin]
keywords: [task permissions, private task, project manager, assigned project management, confirm printer paid, confirm payment in my work, badge breakdown, actions for you, due tasks, search tasks, find task, missing task, lost task, old task, done task, reopen task, next up, shared queue, undated task, due today, today tasks, overdue tasks, your next tasks, suggestions to review, next task, handoff, more options, create task, laptop task form, task, kanban, board, column, to do, in progress, review, done, drag, move, assign, priority, due date, earliest due first, task order, reschedule, edit task, move task to project, milestone, recurring, recurring schedule, google drive, drive loading, cancel drive, small screen, task form scrolling, task attachment, upload file, attach file, working folder, license obligation, printer payment, printing coordinator, proof review, approve proof, reply to printer, budget approval, approve, request changes, wip, time tracking, comment, mention, email task, forwarded email, meeting reminder, booking link, email assistant, task suggestion, learn from email, shared mou funding, invoice owner, delivery evidence, signing invoice, final invoice, waiting for payment, follow up due, source linked task]
order: 30
summary: "Understand task permissions, follow a shared Next up order without due dates, see real deadlines, search for any task, review email suggestions, confirm printer payments, and use Board and Agenda."
---

Tasks are the unit of work. **My Work** brings your personal tasks and dated
obligations together in three views: **Focus**, **Board**, and **Agenda**. Each
project also keeps its own task board.

## My Work

- **Focus** is the daily workspace. **Next up** shows manager-selected work in
  its shared order, even without a due date or with a deadline farther away.
  The summary keeps today's and overdue counts visible. **Due today** then shows
  today's remaining deadlines and payment follow-ups; selected tasks already
  shown above are counted but not duplicated. Dates use the workspace timezone.
  **Working now** shows other started work. **Other assigned work** shows the next five
  remaining tasks, with **Show all** for the full queue. **Waiting on
  confirmation**, **Later**, and **Completed today** are collapsed sections with
  counts. All started and review tasks remain visible. The summary reports open
  work, tasks due today, today's completions, and today's tracked time.
- **Board** shows all tasks assigned to you as **To do**, **In progress**,
  **Review**, and recent **Done** columns. Drag cards or use their status menu;
  filter by project or priority when the board is busy.
- **Agenda** orders tasks and operational deadlines by date. Managers can filter
  the same view to tasks, project deadlines, rights, or finance obligations.

### Understand your menu badge

The **actions for you** summary explains the My Work badge. It adds your tasks
due today or overdue, your pending email task suggestions, and email follow-ups
owned by you that are due. Select the task count to see exactly those due tasks.
The same printer-payment follow-up dates drive this list and the Overdue total.
For example, six due tasks and two owned email follow-ups make eight actions.
Future tasks and proposed email assistant preferences do not add to this total.

On large screens, Focus keeps the main task queue together. Badge totals and
their links stay together above the queue. Work totals appear as a quiet summary
above the tasks. Medium-priority tasks do not repeat a priority badge; open task
details to check or change the priority. Your email follow-ups,
suggestions, and collapsed waiting, later, and completed sections sit beside it.
On smaller screens they follow the task queue. Empty Next up and Due today
sections do not create large empty panels. Home follows the same two-column
layout, with up to three manager reviews and three active projects beside your
task preview.
Open a task's details to edit or delete it; Home keeps those extra controls out
of the preview.

### Find a task

Use **Search all tasks** at the top of My Work when a task seems to be missing.
Type at least two letters from the task title, its project name, or its
description. Results replace the current view until you clear the search, press
**Esc**, or choose **Focus**, **Board**, or **Agenda**.

- **In My Work** lists your matching tasks and shows where each one is, such as
  **In Later** or **In Other assigned work**. This finds tasks hidden in a closed
  section or after the first five rows.
- **Other tasks** lists matching tasks that My Work does not show: your tasks
  marked done more than a week ago, tasks assigned to someone else, and tasks
  that are not assigned. Each result says why, for example **Done Sep 3, 2026**
  or **Assigned to a teammate**.

Select a result to open its task details. If you can edit the task, you can
reopen done work by changing its status. Managers can also assign it back to you.
Members can view project tasks and standalone tasks they created or are assigned.
This includes comments, time entries, and Drive references. Managers can view and
search every task. Deleted tasks cannot be found.

Requested printer payments leave the top action queue while waiting for payment
confirmation. They return with **Follow up due** after three business days or
on an earlier due date. In **Focus**, managers can choose **Confirm printer paid**
on a requested payment. Review the task and project, then confirm that the printer
received the money. The payment is marked paid and the task closes automatically.
The task leaves the open queue while saving and returns if saving fails.
You can also open the linked payment to mark it paid. Linked printer, royalty, license fee,
invoice, and budget approval tasks follow their source records, so ordinary
task status and deletion controls are unavailable for them. Payment tasks link
back to the record that controls them.

Managers also see their own due **External follow-ups** in My Work.
These are lightweight email-response watches rather than tasks. Unassigned
follow-ups appear in **Correspondence ▸ Needs review** until assigned.
Open the thread, snooze the reminder,
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
**My Work ▸ Suggestions to review** until they choose **Add task**, **Already done**, or
**Not a task**. Managers also see it in the correspondence thread's review
area.

When you deliberately forward an email to the correspondence address, Sastra
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
- If the work is only inferred from the original email, it appears under
  **My Work ▸ Suggestions to review**. Edit the task, notes, due date, priority, project, and
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
dismissals, and undos. A proposed preference appears under **My Work ▸ Email assistant preferences** and does nothing
until you choose **Apply**. Patterns shared by several teammates are likewise
reviewed by an admin under **Settings ▸ AI** before becoming workspace rules.
Manage approved personal preferences and turn task suggestions or learning off
under **Settings ▸ Profile ▸ Email assistant preferences**. Notification settings
link to this section. Suggestion notification links open the review section.

## Creating and finishing tasks

**Create task** starts with the title, assignee, optional due date, and project.
Managers can choose **Placement ▸ Next up** to add an assigned one-off task to
the shared order immediately. The default is **Standard queue**. Open
**Description and files** for instructions and Drive references, or **More
options** for priority, repetition, estimate, stage, and milestone. Closing an
optional section keeps the fields and values in the form. In task details,
instructions and task files remain visible; time tracking and Drive management
expand below the core controls.

Completing an ordinary task updates its visible status immediately while Sastra
saves and checks the pipeline. A saved chapter handoff shows the next task, its
owner and due date, with **Open next task**. A failed save restores the prior
state. Source-controlled approval and payment tasks still use their linked
record's actions.

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
On laptops, the wider task form shows description and files beside the assignee,
date, project, and placement fields. On phones, the fields stack in one column.
The description and attachment controls are visible immediately. Expand
**Drive folder (optional)** to choose a working folder. **More options** contains
priority, repeat, estimate, stage, and milestone settings.
The form scrolls when needed. Its title, close button, and **Create task** button
stay visible when you expand more fields. Saving errors appear beside the button.
While Drive opens, an **Opening Google Drive…** message lets you cancel loading.
If opening times out or Google reports an error, try **Add or upload files**
again. Your task fields and selected files stay in the form.
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

Select an assigned task's title on **Home** or in **My Work** to open its
details. Members can change status, fields, dependencies, project placement,
Drive links and folders, or delete ordinary tasks assigned to them. They can
also manage tasks they created while those tasks remain unassigned. Creating a
task does not let you edit it after it is assigned to someone else. Assigned
project managers can manage ordinary tasks and their attachments within their
assigned projects; workspace managers and admins can manage any ordinary task.
Protected approval and payment tasks keep their workflow restrictions.

In **Task details**, choose **Mark task done** when the work is finished. Sastra
updates the status at once and also saves your other changes. If saving fails,
the task returns to its earlier status and your changes stay in the dialog.

Workspace managers can create and assign tasks for anyone. Assigned project
managers can do this within their assigned projects. Members can edit their own
tasks; changing someone else's task needs management access to that project.
Moving someone else's task also requires management access to the destination.
Moving a task clears its **Next up** selection. Workspace-wide queue reordering
stays with workspace managers.
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

**Next up** on **Home** shows the first three actionable tasks chosen by managers,
in the same order as **Workload**. **View all Next up** opens the complete selection
in My Work. The deadline summary stays above it. **Due today** keeps all today's
tasks represented: a task already in Next up is counted and explained there,
without a duplicate row below. **Your next tasks** previews three other tasks,
with started work first. Select a task title to edit it without leaving Home.
Completing or rescheduling a task updates its section and count immediately while
saving. A failed save restores the prior task.

Managers use **Add to Next up** or **Remove from Next up** in task details or
Workload. This changes placement immediately and saves in the background; a
failed save restores the earlier selection. Removing a selection leaves the task
assigned and open. Reassigning a task clears its previous selection and appends
it to its new owner's standard queue. Completing ordinary work clears selection;
reopening it returns it to the standard queue. There is one shared order per
person across projects and standalone tasks, even when several managers assign
work. Priority labels do not override that order.

Selected tasks blocked by dependencies appear in **Next up · blocked**, allowing
ready work to remain visible. Payment requests awaiting confirmation keep their
existing waiting and follow-up rules. If no tasks have been selected, Sastra says
so and shows your other assigned work below.

Outside an explicit Next up selection, the active queue includes overdue and undated work, anything due in the next 30
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

Workspace managers and assigned project managers can **edit** the title,
instructions, cadence, first due date, optional end date, owner, and priority,
or pause/resume or delete schedules they manage. Members can create recurring
tasks for themselves or leave them unassigned, and pause/resume or delete their
own ordinary schedules. Assigning recurring work to someone else or editing a
schedule requires management access to its project; standalone schedules need
a workspace manager. Editing a schedule updates its unfinished occurrence and
all future occurrences; completed tasks remain unchanged as history. Schedules
from license obligations remain restricted to workspace managers, and edits
also correct the matching obligation on the Rights tab.

Generated task cards carry a **Recurring** badge. Editing one generated task
changes only that occurrence; use **Edit** on the recurring schedule to correct
future tasks. On books with more than one print run, a **Task scope** selector
switches the board between the whole title and a specific print run or reprint.

## Comments & @mentions

You can comment on tasks you can view and log your own time on them. You can
edit your own comments and time entries while you still have access to the task;
managers can also remove comments.

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

Home and My Work use the same selection and grouping rules: shared Next up order,
today's remaining work, other started work, then remaining work needing attention.
Deadline counts remain visible above the selection. Manual ordering is retained
within each group; the queue does not independently sort by priority labels.

## Project board on wide screens

The project **Tasks** board shows all four status columns when your screen is
wide, two columns on a medium screen, and one column on a phone. Dragging a card
and the **⋯** menu work the same at every width.
