---
title: "Shared MoU funding"
category: "Publishing"
roles: [manager, admin]
keywords: [regenerate pdf, unsent invoice, billing address, partner address, invoice description, shared mou, review mou funding, agreement, installment, signing invoice, final invoice, invoice owner, delivery evidence, confirm delivery, docx, mp3, mp4, payment deadline]
order: 61
summary: "Review email funding, map existing projects, confirm delivery, and send shared installment invoices."
---

A shared MoU records one funding agreement covering several projects. Each project
has a reviewed allocation. Each installment has one receivable, invoice owner,
and workflow task.

## Review funding from email

Open **Review MoU funding** in the source correspondence or select its notification
in the bell. The bell closes and opens the review immediately while its read
status saves in the background. The document extractor
suggests the works, amounts, dates, processing contact, and delivery requirements.
Open the source document and verify every field before approval.

Map each work to a different existing project using its searchable dropdown. Type part of the project title, then select a
matching project. Approval stays
unavailable until every work is mapped and an eligible invoice owner is selected
or inferred. Missing mappings are identified below the dropdowns. Project allocations and installments must
each equal the agreement total. Approval preserves existing budgets, rights, and
project deadlines. Review conflicting rights or deadlines separately.

If every project has the same eligible creator, that person is the default invoice
owner. Otherwise choose an active manager or administrator. Other eligible project
creators receive visibility notifications. Intake notifications do not send email.

Approval creates unpaid, unbilled installments. Do not use this review for amounts
already invoiced or received. Reprocessing the same document reuses its funding
review; approval does not create another agreement.

## Delivery and invoices

The signing installment becomes actionable on its reviewed signing or eligibility
date. For an already-signed agreement, a signing installment without a source
date defaults to today in the workspace timezone. A future signed date defaults
to that future date. Existing dates remain editable and are preserved. This does
not set the partner payment deadline. A completion installment waits for all covered projects. When completion
requires delivery evidence, the owner's task asks them to confirm delivery first.
Upload evidence under the agreement files and select a file, or add an HTTP or HTTPS
link for each deliverable. Then explicitly confirm
that every requirement is satisfied. A link can point to the delivered file or
its shared folder. Selected files are previewed and attached to the outgoing invoice email. Drafts save
the reviewed evidence selection. Evidence changes clear the previous confirmation unless you
confirm the updated evidence. Delivery reviews are audited.

Generating the invoice PDF keeps the task open. Before issuance, complete the
issuer identity, public contact email, and payment instructions in **Settings →
Workspace → Invoice issuer**. These are your organization’s details, separate
from the partner recipient. The agreement lists any missing fields and links
to invoice settings; generation stays unavailable until they are complete.
Save the workspace settings, then return to the agreement. The PDF
captures the reviewed issuer details. If generation fails, your input remains on
the agreement. Refresh to check whether an invoice was created before retrying. The earliest invoice date controls
eligibility; it is separate from the partner's optional payment deadline.

On the agreement, open **Review and send invoice**. Preview the PDF and delivery
links, check To and CC, and review the message. **Save draft** preserves your
wording without sending. Include all reviewed evidence links in the message.
Check the confirmation and choose **Confirm and send invoice** to send.

Successful sending completes the invoice task. A failed or uncertain delivery
keeps the task open and the draft saved. Check correspondence before retrying;
Sastra blocks a second send while delivery is unresolved. Generated, sent, and
received are separate states. An issued or sent invoice can be voided and replaced after review. The old PDF
and delivery history are retained. An unresolved send must be checked first.

## Tasks and receipts

Invoice tasks appear in My Work, task lists, and agenda. Their initial due date is
the day work becomes actionable in the workspace timezone. You can change that
task date; it does not change the partner's payment deadline. Reassign the invoice
owner on the agreement. Manually completing or deleting an invoice task cannot
replace sending the invoice.

If conditions become unmet, the same task pauses and overdue reminders stop.
Readiness returns to the same task when conditions are restored. Both project
budgets show the shared schedule and each project's allocation.

Record a received installment once on the agreement. Sastra allocates that
receipt across covered projects using the reviewed shares and preserves the
exact receipt total. Eligible creators and the invoice owner receive updates.

The invoice uses your saved letterhead and optional invoice logo. Before generating
a shared invoice, you can enter that partner’s **Bill To address**. It is saved
with the invoice and is not reused as another partner’s address. The PDF includes
a separate payment request page with the payee and bank details from Workspace
settings. PDF previews load securely inside Sastra; **Open attachment** opens the saved file
on your current site. Review the PDF before explicitly sending; the email attaches the
generated PDF, including its payment request pages.

New invoice drafts use the partner organization in **Bill To**, without the
primary contact’s name or email. The email recipient stays separate. Save a
reusable **Billing address** under **Settings → Partners → Edit partner**.
Shared agreements use an unambiguous match to their counterparty name; project
invoices use the linked partner. You can override the address for one invoice.

The editable **Invoice description** starts with the installment milestone and
covered work. For funding reviews approved from email, Sastra uses the original
MoU work titles mapped to the covered projects; otherwise it uses project titles.
Review this wording before generating. To refresh an **unsent shared invoice**, review
its billing address and description on the agreement, then choose **Regenerate PDF**.
This uses current issuer settings and keeps the invoice number, payment, amount,
currency, issue date, and due date. The previous file is retained in the audit history.
If generation fails, the existing PDF remains available. Review the new attachment
and confirm sending again; regeneration does not send an email or complete the task.
Sent, imported, received, and unresolved invoices cannot be regenerated. Sent PDFs
remain unchanged and require the reviewed void-and-replacement workflow.

Invoice PDFs display issue and payment-due dates in U.S. order (MM/DD/YYYY).
Use **Regenerate PDF** on an eligible unsent invoice to apply this formatting.
