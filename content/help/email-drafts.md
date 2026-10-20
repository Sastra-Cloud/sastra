---
title: "Save and resume email drafts"
category: "Communication"
roles: [manager, admin]
keywords: [email draft, save draft, saved email, resume draft, unsaved changes, discard draft, proposal draft, invoice email draft, project context, email branding, sender name, rfq draft, wire email draft, reply draft, close email, review before send, default cc, cc recipients, sending email, sent email]
order: 105
summary: "Save project-specific email drafts, review recipients and attachments, and send from your workspace identity."
---

Managers and admins can save unfinished email wording and return to it later.
Drafts are available in the review-before-send composers for:

- funding proposals;
- partner invoice emails;
- printer quote requests;
- finance / wire requests; and
- correspondence replies.

New invoice drafts name the project or covered projects in the subject and
message. They identify the installment and amount, include delivery evidence
when available, and close with your name and workspace name. Saved drafts keep
your own wording. Generated proposal, print, and finance drafts also use the
supplied project details and sender identity. Review these details before sending.
Outbound correspondence uses the workspace name as its sender display name when
configured in **Settings → Workspace**, with the correspondence address as the
sending address.

Every new composer prefills the workspace's **Default CC recipients for
outbound email**. The list remains visible during review, and the sender can add
or remove recipients for that one message without changing the workspace
default. Admins manage the default in **Settings → Workspace**; everyone who can
send email can see the current list in **Settings → Email**.

Choose **Save draft** after editing. The composer shows **Saved** with the saved
time when the server has stored it, and **Unsaved changes** if you edit it again.
Closing a composer with unsaved changes asks before throwing those latest
changes away. A saved draft remains available after closing, refreshing, or
signing in again. The original action changes to **Resume draft** (or **Resume
email**) where space allows.

Drafts are personal to the teammate who saved them, so one person's unfinished
wording does not overwrite another person's draft. **Discard draft** asks for
confirmation, then removes the saved copy. Sending successfully also removes
your saved draft automatically. A failed send keeps it.

When you send, the composer immediately shows a truthful **Sending…** state
while the mail server is working. It changes to an in-page **Sent** confirmation
only after delivery succeeds. If delivery fails, the sending state disappears
and your editable message remains available. Funding proposals also add a
**Sending** row to proposal history immediately, then replace it with the saved
sent record.

Attachments are not frozen inside an email draft. Sastra rebuilds the
attachment list from the current proposal, invoice, print payment, or project
record whenever you review the composer. Always preview the listed attachment
and complete the final review checkbox before sending.

The Sastra Assistant uses its existing pending-action **Save** control for
drafted emails. Those edits remain in the pending approval until you approve or
decline the action. The approval button says **Send email** and changes to
**Sending…** while delivery is in progress.
