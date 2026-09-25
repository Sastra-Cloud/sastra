---
title: "The Sastra Assistant"
category: "AI & assistant"
roles: [member, manager, admin]
keywords: [assistant, ai, chat, ask, help, wiki, tutorial, knowledge, search, projects, current project, acting on project, move task, create project, project blueprint, units, project workflow, project budget, partner quote, completion date, schedule advice, portfolio capacity, portfolio, project status, deadlines, progress, team, health, blockers, rights, licenses, approve, pending action, draft email, default cc, cc recipients, email sign-off, reviewed email, external email, memory, learning, reflection, feedback, regression, eval, budget, voice, dictation, mobile, full screen, agreement chat, ask about agreements, mou, license, citations, source selection, indexing, what can you do, walk me through, guide me, step by step, help me do this]
order: 110
summary: "Ask the in-app assistant to look things up, take actions, and answer how-to questions."
---

The **Sastra Assistant** is an in-app helper you can chat with. Open it from the
**Assistant** page or the floating launcher in the bottom corner of any page. It
can look things up, take actions on your behalf, and explain how Sastra works.
The floating Assistant opens full-screen on phones so the transcript, approvals,
keyboard, and send controls have enough room; close it with the top-right button.
Sent messages appear in the transcript immediately while the assistant works. If
the request fails, the message returns to the composer so it can be retried.
Feedback, declined previews, and memory review changes also update immediately
and restore their prior state when saving fails.

## What you can ask

- **Look things up** — "what are my open tasks?", "which projects are at risk?",
  "what's due this week?". The assistant reads live data and answers.
- **Ask about projects across the portfolio** — filter by project name, status,
  type, priority, source or target language, deadline, team member, rights holder,
  or rights/license state.
  For example: "which active books are due this quarter?", "which projects is
  Dara working on?", or "which projects still need licenses from Crossway?".
  By default it searches open work; ask for the whole portfolio when completed
  and cancelled projects should be included. Managers and admins can also ask
  about portfolio health and active blockers, such as "which projects are at
  risk?".
- **Take actions** — "create a task to proofread chapter 3", "assign this to
  Dara", "post an update to the project channel". It proposes the change and you
  approve it (see below). When a book has more than one **task scope** (the whole
  project plus one or more print runs or reprints), a task you ask the assistant
  to create is filed into the **scope you are currently viewing** on the Tasks
  board, so it shows up where you are looking. Say it is for the whole book if it
  belongs there instead. The approval preview and the assistant's reply name the
  scope, so you always know where the task will appear. The floating assistant's
  context badge also names the project it will act on. The current page wins over
  an older project discussed in the same conversation. If a task was filed on
  the wrong project, ask the assistant to move that exact task; it preserves the
  task instead of recreating and deleting it.
- **Plan a realistic completion date** — on a project page, ask "when can we
  start this?" or "what completion date is realistic?". The assistant uses the
  same live work-path capacity, running-project finish dates, duration defaults,
  and dated commitments as the completion planner. Managers can then ask it to
  set the chosen **Proposed completion date** on the funding proposal. The
  proposed change is still shown for approval before it saves.
- **Build a project from a conversation** — managers and admins can describe a
  project with its deliverable count, partner, word count, internal costs, and
  public partner rates. The assistant proposes one complete project blueprint
  containing the project, generated article/video/chapter units, standard
  workflow tasks, budget, and itemized partner quote. Nothing is created until
  the blueprint is approved. When the request contains two distinct projects,
  the assistant shows two approval cards so each budget can be reviewed before
  either project is created. Exact unit titles are optional: if only a count is
  known, Sastra creates numbered placeholders such as **Article 1** through
  **Article 52**, which can be renamed later.
  Budgeted blueprints start in **Proposal** status unless you explicitly ask for
  Planning or Active, so an unapproved quotation does not count as live delivery
  work.
- **Start video work** — when creating a video-series project, set its
  project-wide **Original** or **Translation** mode. Original is the default;
  videos created with the project receive the matching standard workflow.
- **How-to questions** — "how do I set up a print run?", "where do I add a
  publisher?". The assistant answers questions about Sastra from this help
  documentation. For your organization's own tutorials and processes, it
  searches published Wiki pages and links you to the matching page or section.

Some screens also have a **Walk me through this** button. It opens the assistant
with a question about that screen already written for you, so you only have to
press send (or add to it, or speak). The assistant then replies in short, plain
steps. It never sends or changes anything without your approval.

## Approvals

Anything that **changes data** (creating a task, sending an email, updating
rights) is shown to you as a **preview** and only runs after you **approve** it.
The assistant never quietly changes things or sends email on its own — external
emails always need their own explicit confirmation.

Permanent task deletion previews name both the exact task and its project.
Moving a task between projects is a separate reviewed action, which prevents a
wrong-project correction from deleting a different task with a similar title.

A project blueprint preview shows the deliverable count, workflow, partner,
internal budget, partner quote, and every budget line. Creating it is atomic:
if its workflow or budget cannot be saved, Sastra does not leave behind an empty
or partly configured project.

For a new external email, the drafting step puts the request first and closes
with your name and the workspace organization. For a reply, it continues the
thread and mirrors an established closing when the conversation already has
one. New drafts prefill the workspace default CC list. The approval preview
remains authoritative: after you review or edit the recipients, subject, and
body, **Send email** changes to **Sending…**, and Sastra sends those exact fields
without rewriting them again.

## Accurate answers only

The assistant answers how-to questions from the help documentation, published
Wiki pages, and your live data. Draft and trashed Wiki pages are never included.
Project questions use bounded, filtered live reads rather than loading every
project into the AI conversation. Results default to a compact summary and have
hard row and response-size limits; the assistant tells you when a broad result
is partial so you can narrow it. These reads do not expose correspondence,
private notes, financial details, or credentials. Project health and blocker
details remain manager/admin-only.
If it cannot find a Sastra feature or an internal process, it says so rather than
inventing steps. A Wiki result can guide you to a video tutorial, but the
assistant only describes details present in the page's searchable text and
captions. If it can't do something your role doesn't allow, it says so and
suggests asking a manager.

Project **Agreement Q&A** is intentionally separate from this Assistant. Open
**Ask about agreements** from a project's Rights page to question selected MoU
and License attachments with clause-level citations. That conversation is
private to you and the project, never enters this Assistant transcript, exposes
no write tools, and does not save agreement text to memory or learning. Agreement
questions use your assistant budget, while background document indexing uses the
workspace AI budget. See **Rights & licensing** for source selection, indexing,
retry, citation, and removed-source behavior.

## Memory, budget, and voice

- **Memory** — ask it to remember a durable preference ("always assign new
  proofreading tasks to me") and it keeps that fact for next time. Clear response
  preferences such as "don't include internal task IDs" are saved as reviewable
  memory candidates even if you do not use the word "remember." You can review,
  approve, edit, and clear memories.
- **Budget** — each person has a monthly assistant spend cap; the workspace
  tracks usage so costs stay predictable.
- **Voice** — you can dictate to the assistant instead of typing. Workspace
  dictionary terms guide transcription, and their optional heard-as aliases fix
  recurring misspellings before the transcript is sent to the assistant. When you
  fix a name in a task preview before approving it, the assistant offers to add
  that spelling to the voice dictionary so dictation gets it right next time.

## How assistant learning works

Admins can review **Assistant learning** under **Settings → AI**. Reflection
studies redacted quality signals from complete assistant runs, including explicit
corrections, negative feedback, failed or inefficient tool runs, declined actions,
and deterministic regressions such as exposing an internal record ID.

One explicit correction can create a provisional lesson candidate so the signal
is not lost. It remains inactive until a second independent incident supports the
same lesson. The candidate must then pass its regression evaluation and receive
admin approval before it can affect assistant behavior. Signals from the same
assistant turn count as one incident, even if the user both corrects the answer
and gives it a negative rating.

Recent reflection cards explain which signal types were found and why no lesson
was proposed. A correction and its follow-up turns remain one incident rather
than being counted repeatedly. Personal preferences remain user memory; they do
not become shared workspace lessons.
