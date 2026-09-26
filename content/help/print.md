---
title: "Print runs, printer quote requests & quotes"
category: "Publishing"
roles: [manager, admin]
keywords: [request printer quotes, source page count, full payment, consolidate payments, wrong wire amount, print, print run, reprint, previous print, historical print, old print, collapse print run, show print details, old quote, legacy quote, copy specs, apply specs, measurement unit, millimetres, millimeters, mm, inches, trim size, rfq, quote request, printer, printing coordinator, payment task, quantity, tier, total price, price per copy, printing in five steps, print steps, first print run, walk me through printing, how to print, recommended balance, economic elbow, sell-through, lowest cost per copy, total cost, cost per copy, incremental cost, comparison, wire, finance, funding received, printer paid, deposit, balance, proof, proof attachment, proof download, proof files, printer waiting for approval, proofing status, suggested project update, invoice, deposit invoice, final invoice, invoice attachment, attachment preview, preview invoice, estimate vs actual, accept quote, accepted, collapse quotes, hide other quotes, show other quotes, reopen quote, un-accept, unaccept, reject quote, reverse acceptance, ai email draft, generated sign-off, learns from edits, email style, draft tone, awaiting payment, wire requested, run status, print correspondence, printer email, email thread, open thread, view thread, missing price, per copy price, cover pdf, book pdf, artwork not a quote, file note, attachment note]
order: 70
summary: "Set up print runs, request printer quotes, review extracted prices, and track print costs."
---

The **Print** tab is the book production and procurement hub for books and
articles. Managers manage it. Nothing here emails anyone until you review and
confirm.

Run specs, quote review state, and payment status update immediately while
saving and roll back on failure. Quote extraction, AI drafting, uploads, printer quote requests,
wire requests, and email show progress and only report completion after the
external work succeeds.

## Printing in five steps

New to printing? The Print tab works in this order:

1. **Set up a print run.** Give it a title, pick a printer, and list the copy
   amounts you want prices for. Saving this does not email anyone.
2. **Ask printers for prices.** Send a printer quote request email (a request for prices). You
   review it before it sends.
3. **Save the prices they send.** Paste the printer's reply or upload their PDF,
   and Sastra reads the prices for you to check.
4. **Accept the best price.** Compare the amounts, then accept one quote. This
   becomes the print cost on the budget.
5. **Pay the printer.** Record the deposit and the final payment as you send
   them.

You can stop and come back at any step. Nothing is sent until you confirm.

## Print settings

Configure the **trim size**, a **language-expansion factor**, **page estimates**,
**printer quote request defaults**, and the **finance email / CC** used for wire requests.

Choose **Inches** or **Millimetres** as the project's **Measurement unit**.
New and existing projects default to inches. Sastra stores one canonical trim
size and converts it for display, so changing the unit does not change the
physical book size. The selected unit is used in project Print settings, print
run summaries and editors, reviewed quote specs, and new printer quote request drafts.

The **Estimate** tile predicts the printed page count from the word count and
expansion factor. Once a printer quote states an actual page count, the tile
shows **that** figure instead (labeled *From printer quote*, or *From accepted
quote* once you accept one) — so the estimate matches what the printer is
actually pricing rather than a word-count guess.

## Setting up a print run

**Set up a print run** creates an internal record — a title, a printer contact,
and printer quote request **quantity tiers**. Saving it does **not** send any email. Use
**Reprints** to copy specs from a prior run and track reprint-only budget,
funding, tasks, quotes, and payments.

An accepted printer quote is an **internal reprint cost**. Open that reprint
under Budget to add freight or handling and separately configure what the
funding partner sees: selected itemized lines or one price per copy. A legacy
funding-goal value is not treated as the printer cost.

## Current and previous prints

The current run stays expanded at the top of the Print tab. When a reprint
exists, earlier source runs are shown as compact **Previous print** rows so
their imported quotes, invoices, and payments do not crowd the active work.
Use **Show details** to reopen the complete historical run; no records are
archived or deleted.

The compact summary uses production facts rather than record dates, because an
older project may have been entered recently. **Printer paid** means every
recorded payment for that run is marked paid. Inside an expanded run,
**Funding received** means donations or MoU receipts received for that run,
**Available** is the expected or reviewed net after the organization donation
fee, and **Printer paid** is money paid out to the printer. These labels describe
different cash flows and may legitimately show different amounts.

## Printer quote requests and finance emails

- An **printer quote request email** asks a printer to price your quantity tiers.
- A **finance / wire-request email** asks for payment.

Both open a **review-before-send composer**. Nothing is sent until you review the
recipients and CC list and confirm — showing a draft is not the same as sending
it.

Choose **Save draft** to keep unfinished printer quote request or wire-request wording. When you
return, the action says **Resume printer quote request email** or **Resume wire email** and restores
your personal saved wording. Current recipients and invoice attachments are
resolved again from the live print record before review. Sending successfully
clears the draft; a failed send keeps it.

New drafts prefill the project or workspace default CC list. Sending shows an
in-page **Sending…** state followed by a persistent **Sent** confirmation; if
delivery fails, the reviewed draft stays open.

The subject and body are **drafted by AI** in the team's usual voice. When you
edit a draft before sending, the app quietly **learns from your changes**: it
compares its draft with what you actually sent and folds the durable
differences (greeting, sign-off, structure, wording, what to include or leave
out) into a shared style guide for that email type — separately for printer quote requests and
wire requests. Future drafts start closer to how the team really writes, so the
edits you make tend to shrink over time. It only learns patterns, never one-off
details like amounts or names, and a failed learning step never affects the
email you just sent.

New printer quote request drafts put the request first, then show title, page count, trim, cover,
quantities, materials, binding, and delivery as a compact list. They explicitly
ask for both the total price and price per copy at every quantity. New wire
requests lead with the payee, payment stage, amount, project, and purpose; they
mention the attached invoice, include a needed-by date only when one is known,
and identify who should receive confirmation. New drafts close with your name
and the workspace organization. These are generated defaults only: the exact
subject and body you approve are what Sastra sends.

Wire-request review also lists every PDF invoice that will be sent. Choose
**Preview** to inspect the exact file inside Sastra before confirming. A wire
request cannot be drafted or sent without a PDF invoice attached to that
payment. Printer quote requests do not include attachments.

Printer email threads linked to a run appear under **Print correspondence**.
Open one to read the full exchange in a panel on the print page — without
leaving for the inbox — with a link into the full thread when you need to reply
or triage. Sastra recognizes saved printer email addresses and domains first.
It then checks projects that use that printer in Print settings or an existing
run. If several projects use the same printer, an exact title/slug mention wins;
otherwise AI may choose only among those known projects when it can cite clear
evidence from the current message. Ambiguous email remains unlinked for review.

PDF proofs attached to matched printer email are stored privately with the
captured message. The newest one appears in the **Latest proof** tile, and every
recognized proof is available under **Proof files** on the Print tab with its
filename, received date, and download link. Managers also get an **Email** link
back to the source correspondence for context or follow-up. Receiving a proof
advances an earlier run to **Proofing** without moving printing, shipping,
completed, or cancelled work backwards. The correspondence thread also shows an
editable **Suggested project status update** saying the proof is ready for
review. A manager must explicitly post or dismiss it; receiving the email never
publishes a project update or changes the project lifecycle automatically.

Some mail providers split a reply into a new captured thread. When the inbound
reply is linked to the same printer and print run, Sastra closes the older
external-response watch so the project no longer says it is waiting on the
printer after the printer has replied.

## Quotes

When a printer replies, capture the quote by **pasting the text** or **uploading
an invoice PDF or photo**; AI extracts the quantity and pricing for your review —
it is never auto-accepted. Files that can't be parsed show under **extraction
issues** with a retry.

Quote and payment attachments can carry a note beneath the filename. Use it for
version details, corrections, approval context, or payment follow-up; editing a
note does not alter the file or accept the related quote or payment.

Every quantity tier the printer lists is captured, including prices written
tightly against the unit such as `0.61per cpy`. If the AI misreads or skips a
tier, it is recovered from the email text and flagged so you can confirm it — a
tier never goes missing or lands with a quantity but no cost. Attachments that
are the **book, a cover, or a print proof** are not turned into quotes.

Captured email keeps one active suggestion for each quote stage and quantity
tier. For an ordinary reply, quote extraction reads only the sender's newest
message above the quoted history, so a proof update cannot refresh prices copied
from an older email. A deliberate forwarded quote still reads the forwarded
content. Repeated current figures refresh the active suggestion instead of
adding another row, even if one copy was labeled a quote and another a generic
invoice. Deposit and final invoices remain separate. Accepted records are never
overwritten; a later email with changed figures creates a new suggestion for
review. New deposit, final, and full-invoice suggestions stay visible for review
even after older quote alternatives have been collapsed.

When you **accept** a quote, that run's other quotes collapse so the accepted
figures stay front and center. A **Show N other quotes** button reveals the
alternatives — and the **Compare print quantities** panel — again for
reference; **Hide other quotes** tucks them back away.

If the reviewed quote includes production specs, **Accept & apply specs** also
updates the run's quoted pages, trim, text and cover stock/specs, binding, and
delivery location. Quote trim is shown in the project's selected measurement
unit before acceptance. Sastra keeps extracted quote dimensions in millimetres
and run dimensions in canonical inches, converting at the input and display
boundary. Edit any misread field in the selected project unit before accepting.
Missing quote fields do not erase specs already saved on the run.

A later **final invoice** is handled as support for the existing final payment,
not as another print quote. Review it and choose **Use for final payment** to
attach its PDF to the scheduled Final Payment. This does not change the payment
amount, accepted print specs, quantity, or budget commitment. Until it is
reviewed, the deposit invoice can remain attached as support for the calculated
final balance. Once a reviewed final-invoice PDF is available, it replaces that
deposit-invoice fallback on the Final Payment; files uploaded directly to the
payment are preserved.

Choose **Wire email** on a payment to draft the finance request. When the draft
is ready, the page moves to the email review card automatically. Nothing is sent
until you review the recipients, message, and attachment and explicitly confirm
the send.

This is useful when entering an older title for a reprint: create a source run,
paste the old quote, review and accept its specs, then choose that run under
**Copy specs from** when setting up the reprint. The new reprint inherits those
specs and can use them in its next printer quote request.

A printer quote request uses the printer selected on the run. If that run has no printer, it
falls back to the project's **Default printer**. The draft names the missing
contact when the selected/default printer does not have an email address, so
you can add the email before sending.

Acceptance is reversible. **Reopen** returns an accepted quote to review and
removes the deposit/final payments that acceptance created; **Reject** discards
it instead. Neither is allowed once a linked payment has been marked paid or had
a wire requested — reset or delete that payment first, then reopen.
Reopening does not roll back production specs already applied to the run; use
**Edit specs** when those values also need to change.

When a quote includes both a quantity and price, its **total print cost** is
shown prominently. If the printer supplies only a per-copy price, the total is
calculated as quantity × price and marked **calculated**.

With two or more priced quantity tiers in the same currency, **Compare print
quantities** shows:

- the lowest total cash outlay,
- the lowest average cost per copy,
- a recommended balance based on the best-priced step-up,
- the additional cash and copies gained by moving to the next tier, and
- the effective cost of each additional copy.

**Recommended balance** marks the destination of the adjacent quantity step
with the lowest useful cost per additional copy. This often identifies the
economic “elbow”: the point where one larger run is unusually inexpensive, but
later tiers require substantially more cash for smaller gains. **Lowest
cost/copy** remains a separate label because the largest run can have the best
average unit price without being the best inventory commitment.

The comparison also estimates how many copies from the recommended larger run
must actually be used before its effective used-copy cost beats the preceding
tier. This is a decision aid, not a demand forecast: storage, shipping,
available cash, and the risk of unused or outdated stock are not included.
Different currencies are never compared with each other.

## Estimate vs actual

The **estimate vs actual (print)** card compares the budgeted print/ship cost to
the accepted quote and to payments, with variance and a warning if MoU funding
falls short. Track **payments** (deposit and balance, wire-requested and paid),
quantity tiers, and proof URLs as the run progresses. When an accepted invoice
creates a matching payment, its uploaded invoice file is carried onto that
payment so it is available for the wire-request email.

For staged invoices, Sastra treats the quoted total as the full print cost and
the final payment as the remaining balance. For example, a USD 1,780 invoice
with a USD 1,068 deposit creates a USD 712 final balance; the full total is not
repeated as the final payment. When that deposit invoice states the full total
and payment terms, its PDF supports both payment rows, so finance can use it for
the later balance without waiting for another document. If a separate final
invoice arrives, review and accept it to attach that PDF to the existing final
payment; Sastra reuses the payment instead of creating a duplicate deposit or
balance.

Requesting a deposit or final wire moves the run's status to **awaiting
payment** (it never rolls a run that is already printing, shipping, or complete
backwards). The **Next payment** tile always shows the earliest unpaid payment,
so it keeps up on its own as deposits and balances are requested and paid.

## Payment ownership

Accepting a reviewed **deposit invoice**, **final invoice**, or full invoice
creates one high-priority task for each payment that is ready to act on. Uploading
an invoice directly to an existing payment creates the same task. A quote by
itself does not create payment work.

The task is assigned to the project's **Printing Coordinator**. If the project
does not have one, it is assigned to the manager who accepted or uploaded the
invoice. It is an ordinary project task, so a manager can reassign it from the
Tasks board. The payment row on the Print tab shows the owner and links to the
task.

The task starts in **To do**, moves to **Review** while the wire request is
awaiting confirmation, and closes when the payment is marked paid. Reopening a
payment reopens its task; deleting the payment removes the generated task. A
confirmed deletion removes only that payment while it saves, so actions on the
other payment rows remain available.


### Paying an accepted invoice in full

Wire drafts use the scheduled payment amount. An accepted order invoice takes
precedence over an older accepted quote when choosing the print commitment.
Before opening or sending a full-payment wire draft, Sastra checks that the
schedule agrees with the accepted order invoice.

If an older full-payment row conflicts with a newer invoice or duplicates its
staged deposit/balance payments, choose **Wire email** on the full-payment row.
Review the proposed invoice total and confirm consolidation. This updates that
row, removes the other untouched generated payments and their tasks, and clears
outdated wire drafts for those payments. Open **Wire email** again to review a
fresh draft and the invoice attachment. Consolidation never sends an email.

Paid, wire-requested, in-progress, and manually entered payments are not consolidated.
Multiple accepted order invoices require review rather than guessing a total.
If a wire send has an uncertain outcome, check correspondence before retrying.
