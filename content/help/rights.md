---
title: "Rights & licensing"
category: "Publishing"
roles: [member, manager, admin]
keywords: [rights, license, licence, mou, commercial, publisher, holder, formats, copyright, obligation, compliance, agreement, multiple projects, multi-project mou, shared agreement pdf, agreement chat, ask about agreements, citations, source selection, indexing, retry index, compare agreements, initiate request, signed email, payment receipt, license fee, file note, attachment note]
order: 50
summary: "The single rights record per project, agreement types, and obligations."
---

Every project has **one rights record** answering a single question: *do we have
the rights we need?* Everyone can view it; editing is a manager action.

Rights fields, holders, contacts, obligations, and fee status respond
immediately while saving. Failed changes restore the last confirmed record.
Creating request tasks remains a progress action because Sastra must confirm the
linked task was created.

## Choosing the agreement type

- **MoU only** — a memorandum of understanding covers everything you need (often
  non-commercial translation, eBook, and audio).
- **MoU + commercial license** — the MoU covers some uses, but a **paid license**
  is needed for others, such as **printing for sale**. For example, a Desiring
  God MoU may let you translate and make an eBook and audiobook, while printing
  the book needs a commercial license from Crossway. Model this as MoU (Desiring
  God) + license (Crossway).
- **Commercial license only** — a single paid license, with no MoU step.

## Working a rights step

Each step records the **publisher / holder** and a **contact**, **who's chasing
it** (assignee), a **status**, and the **signed document** (labelled MoU vs
license). **Initiate request** creates an assigned task in the project's Rights
phase and flips the step to *in progress*, so it shows up in that person's tasks
and notifications. Managers can add a note beneath an attached document to
record version, signing, indexing, or follow-up context without renaming the
file.

## Ask about agreements

Select **Ask about agreements** beside the overall Rights status to ask a
read-only question about the MoU and License files attached directly to this
project. This is a private conversation for you and this project; it does not
appear in project Chat or in your general Sastra Assistant transcript. Agreement
questions do not run assistant tools, change Rights fields, or add agreement
content to Assistant memory or learning.

All readable MoU and License sources start selected. Turn a source off to ask
about only one document, or leave both selected to compare their terms and find
conflicts. Each message remembers the sources used for that question. Suggested
questions cover permitted formats and territories, payment and reporting duties,
termination, and MoU-versus-License comparison.

Answers use numbered citations. Select a citation to read the exact stored
clause, including its section and page when available, or open the original
file. Sastra distinguishes an answer from a term that is **not stated** or is
**ambiguous**, and an answer without valid source evidence is not shown as a
verified answer. Important decisions should still be checked against the cited
language; this feature explains documents and does not provide legal advice.

PDF, DOCX, plain text, Markdown, and common agreement images can be indexed.
Indexing starts automatically when a MoU or License is uploaded or attached.
Searchable PDFs are read locally; scanned or text-poor PDFs use OCR. The
background agreement-index worker discovers older attachments and retries work
that was interrupted, so a source may briefly show as **indexing**. The panel
refreshes while that work runs and selects newly ready sources automatically.
If parsing or search indexing fails, the source changes to **needs attention**
instead of spinning indefinitely. A manager can choose **Retry indexing**; when
the document was already parsed, Sastra keeps that text and retries only the
search index. Spreadsheets and other unsupported files stay downloadable but
cannot be selected for questions. If a source cannot be read, upload an
accessible copy. Members can view the status and ask a manager for help.
Removing a source also removes its searchable index; old answer text remains
visibly historical, but its removed citation can no longer be expanded or
opened.

Use **Clear conversation** to delete only your private agreement history for the
current project. Sastra asks for confirmation first.

Below the steps, tick the **formats** you actually hold (Print / eBook / Audio /
Video), confirm **commercial rights**, and set the **rights start date**,
**complete-by date**, and **max print copies**. An unfinished or overdue rights
record raises a project blocker. For book projects, these choices record what is
permitted, not what is currently planned. Project cards combine them with the
separate **Print plan and funding** decision: owning Print rights alone does not
mark printing as active, while planned print work without Print rights raises a
warning.

## Obligations and payments

The **compliance** card tracks standing **license obligations** — recurring
duties like royalty reporting or renewals. You can also record threaded **rights
notes** and **license-fee payments**. Managers see a linked **correspondence**
panel of related email threads.

Project-linked correspondence can suggest updates from an attached signed MoU,
license, or license-fee receipt. A manager reviews and corrects the suggestion
on the correspondence thread before anything changes. Approving a signed
agreement marks only the selected MoU or License step signed. If the email is
linked to several projects, the manager chooses which projects the agreement
covers; one approval updates each selected Rights record and attaches the PDF
to each one. Approving a receipt marks the selected license-fee ledger entry paid
and keeps the receipt available beside that payment on both Rights and Budget.
When the project has one unlinked legacy task that clearly names the same
publisher and rights work, approval completes and links that task too. Ambiguous
or unrelated tasks are left for a manager.

Monthly and quarterly report reminders begin one reporting period after the
agreement date unless a manager enters a specific first deadline. Annual MoU and
license reports default to **January 31 of the following year**, keeping annual
closeout work together. A date explicitly stated by the agreement always takes
priority over that default.

These report obligations appear as **recurring schedules** on the project Tasks
tab even when there are no other project tasks. Managers can correct an
AI-extracted title, requirement, cadence, first due date, or owner there; the
linked obligation on Rights and its unfinished task occurrence stay in sync.

Reusable publishers and contacts live in **Settings ▸ Publishers**, or add one
inline with the **+** button. AI import reuses matching publisher records when
a document uses a known acronym or shorthand. Use the directory's **Merge**
action for existing duplicates; linked publishers cannot be deleted because
that would detach project rights and correspondence.
