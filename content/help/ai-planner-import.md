---
title: "AI planner & document import"
category: "AI & assistant"
roles: [manager, admin]
keywords: [ai planner, plan with ai, import, document, mou, pdf, extract, draft, interview, duplicate, retry parse, parsing failed, provider error, mixed projects, shared payments, shared mou, completion group, allocation shares, collective completion, shared fees, currency conversion, exchange rate, GBP, pounds, podcast, video series, videos, testimony videos, article collection, grant, grant application, grant proposal, funding proposal, grant id, one project per line item, budget line items, budget arithmetic, imported total, flat amount, unsigned proposal, not yet raised, attach mou, attach agreement, link mou to existing projects, signed mou, umbrella agreement, existing projects, update from document, update project, add document to project, multiple documents, several documents, layer license, review each in turn, paid invoice, upload invoice, past invoice, invoice extraction, record receipt]
order: 120
summary: "Draft a project with the AI planner, or import one from a document."
---

Two manager tools use AI to start a project quickly. Both are **review-first** —
nothing is created until you commit it.

Uploads, parsing, extraction, plan generation, and commit steps show their real
working state rather than pretending to finish instantly. Draft edits remain
available while autosaving; **Saved** or an actionable retry state confirms the
background result.

## Plan with AI

From **Projects ▸ Plan with AI**, the planner **interviews** you about a project
and drafts **phases**, **tasks**, and **chapters**. Review the draft — including
the assumptions and risks it lists — and edit it before committing. Only when you
commit does real project work get created.

## Import from document

From **Projects ▸ Import from document**, upload an **MOU, license, grant
agreement, grant application/proposal, or invoice** (PDF or Word `.docx`). AI
extracts suggested **projects**, **budgets**, **rights**, and an agreement-level
payment schedule for you to review before anything is created. A single document
can produce several different project types, including books, article
collections, podcasts, and video series.

Because agreements sometimes describe the **same payment or cost in more than one
clause**, the review **flags likely duplicates** — payment rows that share a
trigger, amount, and date, or budget lines with the same item and amount — with a
warning. Remove the real duplicate with its **✕** button before saving, so
funding and costs are not counted twice.

Imported budget arithmetic is checked before it reaches the review. When a
document states a line total but the suggested quantity and unit price do not
multiply to that total, Sastra keeps the document's stated total and shows the
line as a flat `1 × total` cost with an explanatory note. Review that line
against the source document before committing it.

**Grant applications / funding proposals** are handled specially: when a proposal
lays out a budget table of activities and their costs, each fundable line-item
becomes **its own project** carrying that line's cost as its budget, and the
proposal's grand total is kept as the agreement total (with the grantor recorded
as the funding partner). For example, a proposal requesting a commentary
translation, a weekly article, study-guide videos, and testimony videos becomes
four projects whose budgets add up to the requested total. Because a proposal is
not yet signed, its costs are **not** marked as raised — the money has not been
awarded yet (see below).

**Attaching a signed MoU to those projects.** The signed MoU that follows a grant
application is usually one umbrella document naming a single project and total —
so on its own it would create a duplicate. When its funding partner matches
projects you already have, the review offers to **attach the agreement to those
existing projects instead of creating a new one**. Tick the box, confirm which
projects it covers (their budgets are shown, and a note confirms when they total
the agreement amount), and committing layers the MoU onto each: it records the
signed date, links them under one **shared MoU** with the grant's payment
schedule and grant ID, and adds the grant's obligations (e.g. a progress-report
reminder) — without touching each project's own budget.

When a payment depends on several projects completing, review shows a **Shared
completion group** preview with the proposed group name, covered projects,
allocation shares, collective rule, agreement total, and payment schedule. The
project shares must add up exactly to the agreement total before commit. The
source document and full schedule are then stored once on the manager-only
Shared MoU, not under an arbitrary project. A completion-triggered invoice waits
until every covered project is completed and the earliest invoice date arrives.

If the reviewed schedule has no multi-project completion dependency, import does
not create a Shared MoU. Single-project schedules retain their normal project
Budget workflow.

Foreign-currency costs are converted to **USD** automatically using the latest
available daily **ECB reference rate** through Frankfurter. The review shows the
rate, provider, and rate date, and each converted budget line keeps its original
amount in a note. If the rate service is unavailable, the original currency is
left unchanged for review instead of blocking the import.

A fee that genuinely applies to several works is split equally across those
projects, with any leftover cents distributed so the shares still add up to the
document total. For example, a £100 administration fee covering eight titles
becomes a £12.50 source cost on each project before conversion. Fees with an
explicit per-title amount remain assigned at that stated amount.

For rights, distinguish between rights the document grants now and a commercial
license that might be needed later. A current non-commercial grant can include
print, ebook, audio, or video formats without claiming that sales are permitted.
Review extracted compliance obligations too: a reporting date stated by the
agreement is preserved, while annual reports without one default to January 31
of the following year.

Before extraction, AI receives the existing **Publishers** directory and reuses
the stored name when a document uses a recognizable shorthand or acronym. A
deterministic check repeats that match on commit, so variants such as "Union
Publishing" and "Union Publishing (UP)" do not create separate rights holders.
Ambiguous acronyms stay reviewable rather than being guessed.

When the document names a **funding partner / sponsor**, committing it also
creates or updates the matching entry in the **Partners** directory (with the
contact it found) and links the project's quotation to it — matched by name so
re-imports don't duplicate. This also applies to a license agreement when its
payment schedule says the licensor will pay us: the payer becomes the funding
partner even though the same organization is also the rights holder.

When the document is a **signed** MoU or grant, the funding it commits appears in
the project's Budget summary as **Raised** immediately after commit. It remains
separate from **Received** until a payment is actually marked received. If the
document did not include an itemized budget, the funding and partner still show
on Budget without inventing quotation costs.

An **unsigned grant application / proposal** is different: its costs are recorded
as the budget, but nothing is marked **Raised**, because the grant has not been
awarded yet. Once the signed MoU arrives, import or **Update from document** with
it to record the committed funding.

When an episodic project — a **podcast** or a **video series** — includes an
episode/video count, committing the import creates the episode (or video) rows
and their production task checklists. A podcast is audio-first (video is added
only when the agreement grants video rights). For a video series, review the
inferred project-wide **Original** or **Translation** mode: original videos get
concept, script, approval, video-production, review, and publishing tasks;
translated videos begin with translation and translation approval. Review whether the document states a
**total** count or **additional** episodes/videos: totals fill only missing rows
on an existing series, while additional ones are appended. The imports list
shows each document's status
(Not parsed / Parsing / Ready to review / Failed / Committed / Discarded), flags
likely **duplicates**, and lets you **retry** or **discard**.

Uploading the same document more than once does not cause a parsing failure.
Each upload is kept as a separate review draft. After extraction, the review
flags project titles that may already exist and defaults exact title matches to
**Update existing** so a second project is not created accidentally.

If parsing fails, the import shows the error category reported by the AI
provider — for example an unreadable or oversized document, an invalid
extraction request, a safety filter, missing provider credit, rate limiting, or
a temporary provider outage. When available, the message includes a provider
detail and a reference ID that an administrator can use to trace the request.
**Retry parse** reuses the same import draft; it does not create a project or a
duplicate by itself. Repeated failures with the same reference or provider
detail should be sent to an administrator before uploading more copies.

## Update a project from documents

An existing project's header has an **Update from document** button (managers
only). Use it when a later agreement, license, or revised budget applies to a
project that already exists, instead of creating a new one.

Select **one or several documents** at once. Each is uploaded, extracted, and
opened for review one at a time — a hint shows how many more are queued for the
project, and applying one automatically opens the next. Nothing changes until
you confirm each document.

For each document you choose what to apply:

- **Rights** advance and **layer** — they never downgrade. Adding a license to a
  project that already has an MoU makes it **MoU + license** rather than
  replacing the MoU. Holders, signed dates, and format rights are filled in
  without clearing what is already there.
- **Budget** lines from the document can be **added** to the existing budget,
  **replace** the whole budget, or be **left unchanged**.
- The project **description** and **start / due dates** are optional updates,
  off by default for dates so an existing schedule is not overwritten.

When the document is an outgoing invoice, the review switches to invoice fields
instead of agreement rights and budget controls. Confirm that your organization
issued it, match it to one of the project's scheduled MoU payments, and enter
the date payment was actually received. The final confirmation stores the
original invoice and records the funding receipt together; AI extraction alone
never marks an invoice paid.

If a document describes several works, pick which one applies to this project.
Agreement-level payment schedules extracted from the document are attached to the
project the same way as on a fresh import.

## When there's no AI key

If the workspace has no AI model configured, only the planner and standup
insights are affected — rights, budget, tasks, chat, exports, and the rest of the
app still work. Admins choose the model behind each AI task in **Settings ▸ AI**.
