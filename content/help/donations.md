---
title: "Donation imports & project funding"
category: "Publishing"
roles: [admin]
keywords: [donations, donation csv, import donations, monthly donations, donor, received funding, project funding, unallocated donation, split donation, multiple projects, duplicate donation, import history, donation match, mou payment, apply donation to mou, reconcile donation, invoice match, budget match, security check, passkey, email code, retention, sensitive columns, source purge]
order: 62
summary: "Admins import monthly donation CSV files, prevent duplicates, and confirm project funding allocations."
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

Select **Import CSV** and choose the giving-platform export. Sastra checks the
whole file before adding donation rows.

- Only rows with a successful payment status enter the donation ledger.
- Successful negative rows enter as refunds or reversals so received-funding
  totals stay accurate. Sastra never auto-posts these adjustments.
- Failed payment rows stay in the import totals but are not recorded as money
  received.
- Import history records the file name, totals, uploader, and duplicate counts.
- Uploading the same file again adds nothing.
- Overlapping monthly exports are safe. Sastra checks each row against all
earlier imports and skips exact duplicates.

Donation CSV uploads use a private, donation-only storage path. Sastra verifies
the real stored type and size after upload and again before parsing; files may
not exceed 5 MB. Other workspace file links cannot be used to open a donation
source file. Sastra rejects exports containing card numbers, verification
codes, bank or routing numbers, Social Security numbers, or tax identifiers and
removes the rejected upload.

If the same donor gave the same amount on the same date but the rows are not
identical—whether in the current CSV or an earlier import—Sastra shows
**Possible duplicate**. An admin must record why the row is a separate gift or
confirm that it is a duplicate.

## Review a suggested match

Select a row under **Needs review**. Sastra may suggest a project or several
projects using:

1. an unpaid invoice or MoU payment with the same amount;
2. an existing Shared MoU and its reviewed project allocation;
3. several unpaid project payments that add up to the donation;
4. the donor's saved funding-partner name;
5. project titles found in the donation note; and
6. earlier allocations confirmed for the same donor.

Suggestions are evidence, not approval. Sastra never posts a donation to a
project without an admin selecting **Confirm allocation**.

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

## What appears on a project

Confirmed project shares appear under **Donations and funding received** on the
project's Budget page. They are locked there so a manager cannot accidentally
change the import record. Admins correct imported allocations from the
**Donations** page, where Sastra keeps the reason and allocation history.

If an allocation confirms an unpaid MoU or invoice, the related scheduled
payment is also marked received.

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
