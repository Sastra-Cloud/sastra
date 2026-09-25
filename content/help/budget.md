---
title: "Budget & quotation"
category: "Publishing"
roles: [member, manager, admin]
keywords: [budget, quotation, quote, internal costs, partner quote, partner safe, assistant project blueprint, create project with budget, conversational project setup, price per copy, per copy invoice, organization donation fee, organization fee, admin fee, donation deduction, fee coverage, funding target, expected net, actual net, available funding, budget attention, next action, section navigation, budget in four steps, what do i do next, walk me through the budget, budget steps, getting started with budget, reprint budget, accepted print quote, add print cost, custom reprint cost, edit budget line, optimistic budget line, unit price, word count, typesetting, funding assigned, raised, to raise, spent, funding, royalties, excel, pdf, export, reconciliation, cashflow, donation mou match, apply donation to mou, shared mou, allocated funding, shared receipt, funding partner, sponsor, funding contact, proposal, funding proposal subject, proposal sign-off, mou proposal, send proposal, proposal history, email attachment, attachment preview, preview quotation, proposed completion date, completion date, suggest a date, completion planner, planning capacity, projects at once, project duration, timeline, deadline, budget approval, approver, approve, request changes, unanimous approval, stale approval, logo, branding, accent color, partners directory, saved partner, paid invoice, upload invoice, past invoice, invoice received, immutable invoice, void invoice, replacement invoice, split payment, edit payment schedule, change mou payment, payment date, invoice owner]
order: 60
summary: "Internal costs, partner-safe quotations, organization donation fees, receipts, and invoices."
---

The Budget separates the real **Project costs** from the **Partner quote** a
donor or funding partner sees and pays. Managers can present selected itemized
costs or one price per copy. Internal labels, notes, spending, and the
organization donation fee are never included in a partner-facing file.

At the top, **Budget attention** lists the current exceptions first: approval
changes or pending decisions, funding still remaining, overdue receivables, and
reconciliation issues. **Next** jumps to the highest-priority item. This is a
summary of the same quotation and payment records shown below; it does not
approve, send, or change anything.

Quotation lines, funding receipts, and payment status update immediately while
they save. If the server rejects a change—for example because a receipt is
locked to a scheduled MoU payment—the previous value returns and the editor
keeps the attempted values for correction.
Receipts created from the admin **Donations** ledger are also locked on the
project Budget page. An admin corrects their project split from **Donations** so
the original gift, unallocated remainder, and review history stay together.
If one of these receipts exactly matches one unpaid MoU payment for the same
project and currency, an admin sees **Apply to MoU** beneath it. This reviewed
action links the existing receipt and marks the payment received without adding
money a second time.
Proposal status changes and **Adopt recorded** reconciliation actions follow the
same pattern: the badge or mismatch row changes immediately, then returns if the
save fails.

## Budget in four steps

New to budgets? The page works in order, from top to bottom:

1. **Plan the costs.** In **Planning**, list what the work will cost. Then set
   the partner quote — the price the funding partner sees.
2. **Get approval and send the proposal.** In **Decisions**, ask your team to
   approve the quote (this is optional), then send the proposal to the partner.
3. **Track the money.** In **Cash and reconciliation**, record funding as it
   arrives and check that it matches the plan.
4. **Handle agreements and fees.** In **Agreements and fees**, schedule partner
   payments, royalties, and license fees.

You can open any section at any time. Nothing is sent or changed until you
approve it.

The **Cash flow** summary shows received, paid out, and net cash first. Monthly
charts appear after there are at least two months of activity, avoiding empty
chart space when a project has only one recorded month.

## Building the quotation

Managers and admins can also ask the **Sastra Assistant** to create a complete
new project from supplied planning data. When the request includes a deliverable
count, partner, word count, internal costs, and public rates, the assistant
shows a reviewable project blueprint before creating the project, workflow,
budget lines, and partner quote together. Use the normal Budget page to adjust
the saved lines afterward. These conversational budget projects start in
**Proposal** status by default and can be moved to Planning or Active after the
partner approves the work.

While viewing an existing project, managers can also ask the assistant when the
project could realistically start or finish. It uses the same live, path-aware
capacity model as the completion planner. After you choose a date, the assistant
can propose updating the real **Proposed completion date** in the funding
proposal; the change is not saved until you approve it. A signed agreement's
completion deadline remains authoritative and cannot be replaced this way.

1. Click **Seed standard lines** to create the standard publishing lines. You
   don't have to seed first — **Add custom line** works on an empty budget too,
   if you'd rather build the quotation by hand.
2. Edit the **Qty** on any standard word-based line, such as Translation. That
   inline value is the shared **Project word count**, so pressing Enter or
   leaving the field updates every word-driven line (translation, editing,
   proofreading, audiobook, and video) together. **Typesetting** also
   recalculates from the word count when no source page count is set. You can
   still edit the same project value in **Quotation settings**. Changes appear
   immediately while saving and roll back if saving fails.
3. Adjust any **unit price** inline, or **reset** it to the default rate. Use
   **Add custom line** for one-off costs. Managers can also edit a line’s name,
   quantity, unit price, assigned funding, and amount spent. A custom line’s unit
   can be changed after it is created.
4. Use **Funding assigned** when promised money is earmarked for a specific
   line. Received donations appear in the project totals automatically; you do
   not need to assign them to every line.

The summary strip shows **Project costs · Partner quote · Committed · Received ·
Available · Spent**. **Committed** includes funding committed by a reviewed MoU or funded license
payment schedule, even before an invoice is paid; **Received** includes only
gross money recorded in the receipt ledger. **Available** is the actual net
amount left after the organization donation fee; older receipts without net
data use the scope’s snapshotted fee to estimate the available amount. The same agreement is not
double-counted when its commitment also appears in line-level **Funding
assigned** values.
Budget group headings follow the project format: for example, article projects
show **Article Publishing**, while video and podcast media groups use their
production labels. The underlying cost categories and calculations are
unchanged.
When a partner quote uses an organization donation fee, its summary card also
shows the rate and **expected net** after that fee. This is a forecast; the separate
**Available** card remains actual received funding available to spend.

## Partner quote and organization donation fee

Open **Partner quote** and choose:

- **Itemized costs** to show selected public lines. Edit the partner-safe label
  and rate without changing the internal cost. **Apply funding target to
  selected lines** suggests upward-rounded public rates on the lines you select.
- **One price per copy** to show only quantity, price per copy, and total.
  **Suggest price** rounds upward to the nearest cent needed to cover costs.

The **Organization donation fee** is the percentage your organization retains
from every donation. It is saved per budget scope. New projects and reprints
snapshot the current workspace default. Existing budgets stay unchanged until a
manager clicks **Set up partner quote**. The coverage sentence shows partner
total, expected available funding, and internal costs. Undercoverage is a
warning, not a send blocker.

The **Main budget plan** and its internal cost table appear before the
partner-facing quotation controls, so managers can establish the real delivery
cost first. Below the internal cost table, Sastra shows **Project costs**, the
system-calculated **Organization fee coverage**, and the **Minimum funding
target**. The coverage is calculated from the gross donation—not by simply
adding 13% to the costs—so the full project cost remains after the organization
fee.
It is internal only, cannot be edited as an expense, and is never shown as a
fee line to the partner.

For an itemized partner quote, select the public lines that should absorb the
funding difference and choose **Apply funding target to selected lines**. Sastra
uses every internal cost, including hidden shipping or handling, when it
calculates the selected public rates. This changes only the partner-safe rates;
the real internal costs remain unchanged. Suggested rates are calculated from
the saved internal amounts and rounded upward at the displayed rate precision;
Sastra verifies that the resulting expected net is at least the full internal
cost, including when a line amount was adjusted separately from its unit rate.

When the partner quote has no unsaved changes, its action area shows **Saved**
instead of prompting you to save again. Editing the quote brings back **Save
partner quote**; preview remains tied to the last saved version until the change
is saved.

**Export to Excel** is the internal detailed workbook. **Preview partner file**
creates a sanitized Excel workbook for itemized quotes or a PDF for per-copy
quotes.

## Set up a reprint budget

Choose the active reprint under **Budget scope**. When the scoped budget is
empty, **Next: Add accepted print quote** jumps to its setup card. If the Print
tab already has an accepted quote, click **Add accepted quote to budget** to
create the reprint’s Print / ship line using the accepted total; you do not need
to retype it. Add freight, insurance, local delivery, or other costs with **Add
a custom reprint cost**.

New custom lines and accepted-quote lines appear immediately while the server
saves them. Existing lines update immediately after **Save**. A small
**Saving…** label identifies the row in flight; other rows remain available. If
the save fails, Sastra removes the temporary line or restores the previous
saved totals, reopens the attempted values for correction, and shows the error.

The project quotation is your **fundraising plan** — what to raise. The Print
tab remains the operational source for printer quotes, invoices, and payments;
the run-scoped Budget view itemizes the accepted reprint cost and any additional
costs. **AI spend** is shown as an operational cost and is deliberately *not*
part of the quotation.

## Moving between budget sections

Use the section bar to jump between **Planning**, **Decisions**, **Cash &
reconciliation**, **Agreements & fees**, and **AI spend & notes**. All sections
are open by default so nothing is hidden; collapse one from its header when you
want to tidy the page. Collapsing a section changes only the page layout—it does
not approve, complete, or dismiss anything.

On books with more than one print run, **Budget scope** switches between **Main
project**, each reprint, and **All history**. Main and reprint finances remain
separate. All history is an aggregate, read-only audit view.

Managers can edit any **unpaid** MoU payment from the pencil button on its row.
The amount, trigger, expected date, partner invoice description, internal note,
and invoice owner are editable.
The row updates immediately while saving and returns to the exact previous state
with the entered values reopened if saving fails. If an invoice was generated,
it is immutable: void it before changing the schedule, then generate a
replacement. The old PDF remains in history. Received payments are locked to
protect their receipt history; choose
**Undo received payment** first when a correction is genuinely required.

Choose **Split partner total into 2** to create equal initial and final
installments; any odd cent goes to the final installment. Generating an invoice
stores an immutable PDF with one partner-safe line and the workspace remittance
instructions. **Mark received** opens a review step for gross amount, actual
available net, and received date.

When a project belongs to a **Shared MoU**, managers see its reviewed agreement
share near the budget summary. The group's payment schedule is not duplicated on
each project. After a shared payment is recorded once, this project receives its
proportional funding allocation as a receipt; all project allocations reconcile
exactly to the group receipt. Open the Shared MoU banner for the collective
completion gate, full schedule, invoice, and receipt reconciliation.

### Record a past paid invoice

For an unpaid row in **MoU Payment Schedule**, choose **Upload paid invoice** and
select the original PDF, image, or Word file. AI reads the invoice number, dates,
bill-to details, description, currency, and total. Review every field, confirm
that your organization issued the invoice, select the scheduled payment it
settles, and enter the actual payment-received date.

Nothing is recorded during extraction. **Save invoice & record receipt** stores
the original document, saves or updates the invoice, adjusts the selected
schedule to the reviewed amount when necessary, and records the funding receipt
together. If any part fails, neither the invoice nor receipt is left half-saved.
The same flow is available through the project header's **Update from document**
button when AI detects that the uploaded document is an invoice.

## Funding partner & proposal

Record the **funding partner / sponsor**, the contact's **first** and **last
name**, an **email**, and a free-text **contact note** in **Quotation settings**
— or **Use a saved partner** to fill them from the **Partners** directory
(Settings → Partners), which also links the project to that partner.
The email and first name address and greet the proposal below; the full name
appears on the quotation's **Attn:** line. The **Description of work** is
free-text so you can state the deliverable and format — e.g. "translated and
published in the target language", or "target-language eBook edition" — since it isn't always a print
run.

Committing an AI-reviewed agreement fills this card automatically when the
document identifies who is funding the work. That includes a license whose
counterparty is paying us; a normal license fee that we owe does not turn the
rights holder into a funding partner.

The printing line is kept in step with the Print tab: in-app it carries a small
status badge (**quote** once a printer quote is accepted, otherwise **estimate**
/ **awaiting quote**); that status is not printed on the shared quotation.

## Requesting internal approval

Budget approval is optional. If your team wants internal sign-off for a
quotation, a manager can set it up directly on the Budget screen. Approval is
separate for the main project and each reprint scope:

1. Open **Budget approval** beneath the quotation.
2. Select one or more active workspace managers or admins directly on the Budget
   screen. They do not need a project coordinator role. The requester cannot
   select themself, and every selected person is required.
3. Choose the shared due date and click **Request approval**.

Until a request is created, proposals can be sent normally. Creating a request
activates the approval gate for that quotation. Each approver then receives an
assigned task and notification. The approval card shows who is waiting, who
approved, the time of each decision, and any requested change. Approval is
unanimous: one approval does not release the proposal while another person is
still waiting.

An approver opens the task or the Budget approval card and chooses **Approve**
or **Request changes**. A change request must explain what needs to be revised.
These tasks cannot be completed, reassigned, dragged to another status, or
deleted through ordinary task controls; only the dedicated decision records
approval. Managers and admins can change the due date from an approval task. For
the current round, this changes the shared deadline on every approver's task and
on the Budget approval card.

Changing a quotation line, quantity, unit price, total, currency, quotation
setting, funding partner, or description of work invalidates decisions for the
old version. Sastra preserves a completed round in **Approval history**, opens a
fresh round for the same approvers, and notifies anyone who must approve again.
Several edits made while a round is still pending are consolidated into that
round. Updating **Funding assigned**, **Spent**, or an internal budget note does not change
the partner quotation and does not invalidate approval.

Before a license or MoU is signed, managers can optionally set a **Proposed
completion date** on the proposal card. Leave it blank to draft and send without
mentioning a timeline. When set, drafted proposals offer that date as your
target timeline (instead of leaning on whatever date a publisher suggests). Once
an agreement sets a real completion deadline, that deadline governs and the
proposed date is no longer used — the card shows the agreement date instead.

**Suggest a date** opens a quick planner that proposes a realistic completion
date for a *new* project *on the same work path*. The new book can start once a
book currently **in production** frees a slot — or now, if a slot is free — and
then takes the typical duration. So the date stays **near-term** rather than
queuing years behind your whole backlog. Because it's scoped to the path, a
book's date isn't affected by the Creative media line (and vice-versa).

The planner shows the same reality as the Schedule roadmap: the path's committed
books **listed by due date**, with any that are **past their due date flagged
overdue (red)**. If the path already has overdue books, it says so plainly — the
suggested date assumes the new book takes the next open slot, so you'd be
prioritizing it over work that's already behind. Adjust the two assumptions
(projects at once, typical duration) to see the date move, then **Use this date**.
The defaults come from **Settings ▸ Workspace ▸ Planning capacity**, and a hint
shows what your completed books of this type actually averaged. It's a plain
calculation — nothing is sent anywhere.

**Draft proposal** (managers) writes an AI proposal email and opens a
**review-before-send composer** — nothing is sent until you review the recipient
and confirm. A draft can be created before a funding contact email is recorded;
the email is required only when sending. Drafting remains available before approval, but
once approval has been requested, **Send proposal** stays disabled until every
selected approver has approved the current quotation. Sending **attaches the
exact saved partner file**—sanitized Excel for itemized quotes or PDF for
price-per-copy quotes—and links the email to the project as
correspondence, so everything stays in
Sastra. Every proposal is kept in a **history** list (recipient, total, date,
the exact file that was sent) whose status you can move **Sent → Accepted /
Declined** to track where the project stands. As with other emails, the drafter
learns from any edits you make. A funding contact email is required to send.

As soon as you confirm, proposal history adds a **Sending** row. When the mail
server succeeds, it becomes the canonical sent record; if delivery fails, the
temporary row disappears and the reviewed draft stays open. Proposal and
invoice composers also prefill the workspace default CC list, which remains
visible and editable for that one email.

A new draft uses **Funding proposal: Project title** as its default subject. It
states the amount and project first, identifies the attached quotation, includes
the proposed completion date only when one is available, and asks the partner to
move forward with an MoU or reply with changes. The generated sign-off uses your
name and the workspace organization. Editing either field in the composer is
safe: Sastra sends the exact version you review and confirm.

Use **Save draft** to keep proposal or invoice-email wording without sending.
The card shows the saved time and marks later edits as **Unsaved changes**.
After closing or refreshing, choose **Resume draft** / **Resume email** to
continue. A successful send removes your personal saved draft; a failed send
keeps it.

The review composer lists the exact quotation filename under **Attachments**.
Choose **Preview** before confirming. PDFs and images open inside Sastra;
spreadsheets show their exact filename and can be opened in a new tab for
inspection. Partner invoice emails use the same attachment review and show the
immutable invoice PDF that will be sent.

## Excel export

**Export to Excel** downloads the internal `.xlsx` that mirrors
the team's quotation layout with **live formulas**, so you can share it or edit it
outside the app. It carries your **workspace logo and accent color** (set in
Team settings → Branding), colored section bands, accounting number formats, and
a highlighted total. The tool costs every line, including Cover Design; if a
reference spreadsheet shows a lower total it's usually because a line was left
blank there — set a line to 0 if it genuinely shouldn't be charged.

The partner attachment is generated separately. Itemized mode includes only
lines marked visible and uses their partner labels and rates. Per-copy mode
creates a PDF with quantity, unit price, and total only. Neither file includes
internal line costs, internal notes, assigned-funding/spent values, or the organization
donation fee.

When you **accept a printer quote** on the Print tab, the print/ship line here is
updated to that quote's real total (including per-copy quotes that had no
explicit total), so the quotation and proposal reflect the confirmed print cost.

### Shared installment invoices

Shared agreement banners show each installment and its current readiness, alongside
this project's reviewed allocation. Open the agreement to manage the shared owner,
delivery evidence, and invoices. Generating a PDF does not complete the invoice
task: explicit reviewed sending completes it. The earliest invoice date is separate
from the partner's optional payment deadline. See **Shared MoU funding** for the
full review and delivery workflow.
