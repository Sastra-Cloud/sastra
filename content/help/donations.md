---
title: "Donation imports & project funding"
category: "Publishing"
roles: [admin]
keywords: [donations, bulk review, confirm duplicates, mark duplicates, mark all as duplicates, undo duplicate, select donations, keep many unallocated, donation csv, import donations, monthly donations, csv format, new csv format, set up csv format, csv columns, column mapping, saved csv formats, forget format, fund manager export, donation detail, suggest with ai, donor, received funding, project funding, unallocated donation, split donation, multiple projects, duplicate donation, import history, donation match, mou payment, apply donation to mou, reconcile donation, invoice match, budget match, security check, passkey, email code, retention, sensitive columns, source purge, sent invoice, sponsorship invoice, posted, saved project links, edit allocations]
order: 62
summary: "Admins import donation CSV files from any giving platform, save new CSV formats, match donations to sent invoices, sponsorships, and project payments, then review saved funding links."
---

The **Donations** page is an admin-only workspace for money received through an
external giving system. Open **Management → Donations** to import a monthly CSV,
review suggested project matches, and keep a clear record of funding that has
not been assigned to a project.

Donation records and their source files are visible only to admins. Before
opening the page, Sastra asks an admin to verify with a passkey or a six-digit
email code. That browser then remains trusted for 60 days unless the admin
revokes it under **Settings → Security**.

## Import a monthly CSV

Select **Import CSV** and choose the export from your giving platform or fund
manager. Sastra checks the whole file before adding donation rows.

- When the file has a payment status column, only rows with a received status
  enter the donation ledger.
- When the file has no status column, such as a fund manager's donation detail
  download, every row counts as money received.
- A row with an empty donor name is recorded as **Anonymous**.
- Successful negative rows enter as refunds or reversals so received-funding
  totals stay accurate. Sastra never auto-posts these adjustments.
- Failed payment rows stay in the import totals but are not recorded as money
  received.
- Every row must use the workspace currency. Sastra stops the import and names
  the row when a gift uses another currency.
- When something in the file is wrong, the message names the row, such as
  "Row 5 has an invalid date."
- Import history records the file name, totals, uploader, and duplicate counts.
- Uploading the same file again adds nothing.
- Overlapping monthly exports are safe. Sastra checks each row against all
earlier imports and skips exact duplicates.
- Two identical rows in one file, such as two anonymous $25 gifts on the same
  day, are both kept. The second one is marked **Possible duplicate** so an
  admin can confirm it is a separate gift.

Donation CSV uploads use a private, donation-only storage path. Sastra verifies
the real stored type and size after upload and again before parsing; files may
not exceed 5 MB. Other workspace file links cannot be used to open a donation
source file. Sastra rejects exports containing card numbers, verification
codes, bank or routing numbers, Social Security numbers, or tax identifiers and
removes the rejected upload.

If the same donor gave the same amount on the same date but the rows are not
identical—whether in the current CSV or an earlier import—Sastra shows
**Possible duplicate**. This check treats "Anonymous", "Anonymous Donor", and
similar names as the same donor, and ignores "&" and "and" in names, so the
same gift in exports from two systems is still caught.

## Review possible duplicates

A repeat gift with the same donor, amount, and date is rare, so most possible
duplicates are the same gift in two files. Sastra makes confirming them fast:

- **All at once:** under **Needs review**, the possible duplicates box shows how
  many there are. Select **Show only these** to check them, then **Mark all as
  duplicates**.
- **Some of them:** tick the rows you want and select **Mark as duplicates** in
  the bar above the list. Untick any row that is a real separate gift first.
- **One at a time:** select a row. Sastra shows the new row next to the donation
  it matches, with each file name and row number. Select **Confirm duplicate**.
  Sastra opens the next row for you.

Sastra asks before marking several rows. A confirmed duplicate does not count as
money received. Select **Undo** in the message that appears right after to send
the rows back to review.

To keep a row as a separate gift, select **It is a separate gift**, write why,
and select **Keep as new gift**. The row then waits for a normal project review.

## Set up a new CSV format

The first time you import a file with columns Sastra has not seen, Sastra opens
**Set up a new CSV format** instead of importing right away.

1. Check which column holds each detail. **Gift date**, **Donor**, and
   **Amount** are required. Choose **Not in this file** for any other detail the
   file does not have.
2. If the file has a **Payment status** column, tick the statuses that mean the
   money was received. Other rows count as failed payments.
3. If dates are written with numbers only, such as 03/04/2026, choose the
   **Date order**.
4. Check the **Preview**. It shows the first rows, how many rows count as
   received, and the total. If something is wrong, the preview names the row.
5. Give the format a name and select **Save format and import**.

Sastra remembers the format. Later files with the same columns import directly,
without this step. Sastra reads dates such as "October 16, 2026", "16 Oct 2026",
and 2026-10-16, and amounts such as "$6,094.69", "USD 25", and "(25.00)" for a
refund.

### Let AI suggest the columns

When Sastra cannot find the date, donor, or amount columns by their names, and
an AI key is set up under **Settings → AI**, AI suggests the columns
automatically. You can also select **Suggest with AI** at any time. AI sees only
the column names and masked patterns such as "October 99, 9999" or "$9,999.99".
It never sees donor names, addresses, contact details, or notes. Always check
the suggestion before you import.

### Change or forget a saved format

Open **Import history** to see **Saved CSV formats**. Select **Forget** to
remove a format that was set up wrong. Imported donations do not change. The
next file with those columns opens the setup step again. Import history also
shows which saved format read each file.

## Review a suggested match

Select a row under **Needs review**. Sastra may suggest a project or several
projects using:

1. sent invoices with matching recipients, invoice numbers, currency, and unpaid balances;
2. sponsorship invoice lines, including invoices covering several books;
3. an existing Shared MoU and its reviewed project allocation;
4. several unpaid invoices or project payments that add up to the donation;
5. the donor's saved funding-partner name;
6. project titles found in the donation note; and
7. earlier allocations confirmed for the same donor.

Suggestions are evidence, not approval. Sastra never posts a donation to a
project without an admin selecting **Confirm allocation**.

Invoice matches preserve the reviewed project split. One donation can settle one
invoice or several invoices. If several combinations fit, review the invoice
numbers and split. Void, received, and unsent invoices are excluded from new
sent-invoice matches.

Sponsorship matches use the unpaid book shares after earlier payments. Review
**Available sponsorship funds** after the saved organization donation fee, and
correct that amount if needed. Confirmation adds sponsorship funds, separate
from production budgets. Fully paid invoices are marked received. Partial
sponsorship payments keep the remaining invoice balance unpaid.

Remove an invoice match to choose a different allocation. All project shares for
that invoice are removed together.

## Review a posted donation

**Posted** means its project links are already saved. The table shows **Linked
projects**, and the detail panel shows **Saved project links** with their amounts.
No further confirmation is needed. Each link states whether it is production
funding, a received scheduled payment, or sponsorship funds.

Choose **Edit allocations** to make a correction. Add a reason, review the
amounts, then choose **Save allocation changes**. **Cancel editing** keeps the
saved links. A partially allocated gift shows its saved links and the remaining
unallocated amount.

Correct imported sponsorship payments from **Donations**. Their old receipts
stay in sponsorship history as reversals. Funds already used cannot be removed
until those uses are reversed or enough replacement funding remains.

## Link a scheduled payment

When an allocation has the same project, amount, and currency as exactly one
unpaid project MoU payment, Sastra shows that exact match in the review row.
Confirming the allocation marks the MoU payment received. Choose **Keep as
donation only** first when the gift belongs to the project but does not settle
that MoU payment.

## Split one donation across projects

Add each project and enter its share. The total cannot be greater than the
donation.

For a negative refund or reversal, enter negative project amounts. The combined
adjustment cannot be larger than the imported negative total.

If the project shares are less than the donation, the remaining amount stays in
the workspace ledger. This is useful when one gift covers several projects but
the complete split is not known yet.

When a donation exactly matches a reviewed Shared MoU payment, Sastra suggests
that agreement's existing project split. Changing those amounts removes the MoU
match and turns the rows into a manual allocation.

## Keep money unallocated

Select **Keep unallocated** when the donation is real but no project assignment
is known. The gift remains under **Unallocated** and still counts as money
received by the organization.

You can return later and assign all or part of it to projects.

To clear many donations at once, tick them under **Needs review** and select
**Keep unallocated** in the bar above the list. Only rows with no project links
change. Sastra asks before saving.

## What appears on a project

Confirmed project shares appear under **Donations and funding received** on the
project's Budget page. They are locked there so a manager cannot accidentally
change the import record. Admins correct imported allocations from the
**Donations** page, where Sastra keeps the reason and allocation history.

A linked MoU payment is also marked received. Matched invoices are marked
received when their full balance is paid.

For an older posted allocation that was linked only to the project, an admin may
see **Exact MoU match** beneath its locked receipt on the project Budget page.
Select **Apply to MoU** to confirm the exact project, amount, and currency match.
Sastra then links the existing receipt and marks the scheduled payment received;
it does not create a second receipt. Ambiguous or partial matches must be
reviewed from **Donations** instead.

## Source files and accounting history

The parsed donation ledger, allocations, duplicate decisions, and review
history are accounting records and are not removed when a source CSV is later
purged. The original CSV is a short-lived recovery copy. Sastra deletes it after
the workspace's source-file retention period, which defaults to 30 days.
Administrators can place a legal hold on an import when the source file must be
kept longer.
