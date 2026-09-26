---
title: "Correspondence (email intake)"
category: "Communication"
roles: [manager, admin]
keywords: [search, pagination, next page, filters, subject, correspondence, email, inbox, gmail, webhook, resend, receiving email, original email file, thread, email history, newest email first, quoted history, forwarded history, recent correspondence, project email, project filter, expand message, reprocess message, reprocess thread, project status suggestion, email project update, post project update, publisher, rights, partner, printer, reply, triage, mailbox, waiting, external follow up, follow-up reminder, snooze, draft follow-up, multiple projects, review projects, link projects, many projects from one email, multi-project mou, shared agreement pdf, attach mou to several projects, video series, original video, translated video, production mode, grant reminder, funder deadline, grant report due date, reminder from email, grant obligation, final report due, recurring report, duplicate project, funder already funds, existing grant, link to existing grant, not a new project, dismiss reason, intake learning, learns from dismissals, negative rules, stop re-suggesting, approve lesson, forwarded email task, proof review task, reply to printer, meeting task, secretary, assistant, signed license, payment receipt, license fee, print proof, proof attachment, restore proof, reprocess proof, shared mou funding, invoice owner, delivery evidence, signing invoice, final invoice]
order: 100
summary: "Search project email by subject or linked project and review filtered pages of correspondence."
---

**Correspondence** captures email from a shared mailbox so publisher, printer, and
finance conversations live next to the projects they belong to. It's sensitive
operational data, so it's **manager-only** — members don't see it.

Triage status, project links, and assignees update immediately and roll back if
saving fails. Reprocessing and sending replies show progress; replies require a
final recipient confirmation and only show **sent** after the mailbox accepts
them.

## How email arrives

Every workspace has one **correspondence address**, shown in **Settings ▸ Email**.
CC or forward partner and printer email to it. With a shared **Gmail** mailbox
the address is polled automatically. Without Gmail, the deployment owner can
connect an email provider that delivers each message to Sastra as it arrives
(a **webhook**); **Settings ▸ Email** shows which one is in use under
**Receiving email through**. Either way, Gmail's conversation ID is used when
available, with standard email reply headers as a fallback, so replies from the
same conversation stay in one **thread**. Sastra keeps the original email file
so attachments can be restored later without contacting the mailbox again. Threads are filtered into
**Project-related**, **Other**, and **All**,
and auto-linked to a project and rights holder or printer where possible. Threads
that couldn't be linked are flagged.

Managers can also choose **View all** from a project's **Recent
correspondence** section. This opens Correspondence filtered to that project;
choose **Clear project filter** to return to all project-related email.

## Triaging a thread

Open a thread to read the message history. The newest message appears first and
is expanded; older messages follow beneath it and can be opened individually.
Repeated text copied from an earlier reply
is kept under **Show quoted history**, while a newly submitted forwarded chain is
kept under **Show forwarded history**. Attachments stay with the actual message
that carried them. Managers can set the thread's **status** (open / waiting /
done), link it to one or more **projects** and an **assignee**, and — when Gmail
is connected — **reply inline**.

When an active teammate forwards a message into the mailbox, Sastra separately
checks for a concrete human next step. The teammate's text above the forwarded
marker is treated as their authenticated instruction; the original sender and
email body are evidence, not commands. An explicit “create a task” or “remind
me” note may create a self-owned task, while an inferred action always appears
as an editable review card on the thread and in that teammate's **My Work**.
Managers can adjust its project and assignee. Useful booking or document links
are preserved exactly, and no due date is invented when the email has none.

## Waiting on an external response

When a project-linked message is sent to someone outside the organization,
Sastra changes the thread to **Waiting** and records a concise external
follow-up on every linked project's overview. The summary uses only the newest
message above quoted history. If AI cannot summarize it, the email subject is
used instead. Internal forwards into the capture mailbox do not create a wait.

The responsible manager is the thread assignee, the manager who sent the latest
message, or the existing thread owner, in that order. If no reply arrives by the
workspace's follow-up interval, the owner sees the item in **My Work** and gets
one in-app/push reminder. Another outbound follow-up resets the timer; an inbound
reply reopens the thread and resolves the wait automatically.

Managers can **Draft follow-up** into the existing reply box, **Snooze** for one,
three, or five business days, or **Resolve** the wait. Drafting never sends;
recipient confirmation is still required. **Share as project update** opens an
editable summary that must be posted explicitly. These waits do not change the
project lifecycle, create tasks, or count as blockers.

Use **Save draft** in the reply box to keep unfinished wording on the thread.
The saved reply returns after a refresh or later sign-in and is personal to the
teammate who saved it. **Discard draft** clears it after confirmation. A
successful reply removes the saved draft automatically; a failed send keeps it.

New replies prefill the workspace default CC list, which remains editable before
sending. The reply card shows **Sending…** immediately and keeps a **Sent**
confirmation after the mail server succeeds; a failed send preserves the reply
text and CC list.

A thread can be linked to **several projects** — one email often concerns more
than one. The **Projects** field lists each linked project as a chip. Use **Link
a project** to search and attach an existing project, remove a chip to unlink,
or choose **Create new project** to make one and link it (its title is prefilled
from the email subject and the type defaults to **Article**).

When AI reads an unlinked email as starting new work, it can propose **several**
new projects from a single email — a funding email covering two booklets becomes
two suggestions. Managers and admins get one notification per email; opening it,
or the **Review projects** banner on the thread, opens a dedicated **review
screen** listing every detected project with an editable title, inferred type
(Book, Article, Podcast, Video series, or Other), and goal / description. Video
series also show an editable **Original** or **Translation** mode. Check the ones to
create, edit anything that needs correcting, then **Create projects** — each is
created and linked to the thread at once. Remove a single suggestion with its
✕, or **Dismiss all** when the email should not become a project. Suggestions
are review-only — nothing is created automatically — and opening the
notification no longer hides them; they stay on the review screen until you
create or dismiss them.

When you dismiss suggestions, you can add a short note on **why** it isn't a new
project (for example, "belongs to an existing grant"). The intake AI **learns**
from these dismissals: a review pass distills repeated dismissals into negative
rules so it stops re-suggesting the same kind of thing. This is human-gated —
nothing is applied automatically. An admin approves each rule under **Settings ▸
AI ▸ Email intake learning** before it takes effect, and can retire a rule later.

If the email is from a **funder who already funds existing projects** (a known
grant), the review screen warns you at the top — a grant-award or update email
usually concerns that grant's existing work, not new projects. Use **Link the
email to N projects** to attach the thread to those projects (and dismiss the
duplicate suggestions) in one click, rather than creating a fifth project. You
can still create a project anyway if it is genuinely new.

The same review can identify a likely **rights holder / publisher**, **funding
partner**, or **printer** from the sender and email content. Known contacts are
matched to the existing directory automatically when their email or domain is
unambiguous. Funding-partner suggestions show the organization and person
separately, labeling each as **Existing** or **New**, and explain exactly what
approval will do. Approving can link an existing partner and existing contact,
add a new contact to an existing partner and link both, or create a new partner
with its first contact and link it. If the automatic match is wrong or misses a
partner whose saved name is different, choose the correct organization from the
**Use existing partner** selector before approving. The saved contact email and
normalized organization name are rechecked when the card opens and again on
approval, so an older pending suggestion reflects the current directory.
Dismissing a suggestion makes no directory changes.

## Grant reminders and reporting obligations

When a funder's email states a **dated deliverable** — for example, "we will need
a final grant report submitted... the due date for that final report is August
31, 2025" — AI proposes a **grant reminder** on the thread. A single deadline
becomes a one-off **dated task**; an ongoing "report every month / quarter / year"
duty becomes a recurring **grant obligation** on the project's Rights tab.
Grant reminders require a known or high-confidence funding-partner context. A
printer or other vendor promising to send a proof, file, quote, or delivery does
not qualify, and a one-off reminder is not proposed unless the email gives an
explicit valid calendar date.

The reminder is aimed at **the grant's projects**: the projects already linked to
the thread, or — for a funding partner — the projects funded by that partner
(matched from the saved partner/contact relationship, with a name fallback for
older records). On the thread, the review card lists each detected
deliverable, an **editable due date**, and a **checkbox per project** (all checked
by default). This is review-first: nothing is created until a manager clicks
**Approve**, which adds the task or recurring obligation to each selected project
and assigns it to that project's owner. Use **Dismiss** to discard it with no
changes. Reprocessing a thread re-checks for grant reminders too.

Saved funding-partner and contact links are used before AI to identify the
project. When one contact funds several existing projects, AI may select only
from that verified set and only with high-confidence evidence copied from the
current message; otherwise the thread stays available for manual linking.

For normal replies, correspondence AI reads the new text above quoted history;
it does not repeatedly send the copied conversation underneath every reply. A
deliberate forward is different: the forwarded chain may be new to Sastra, so AI
reads the complete forwarded message on its first review. Correspondence AI also
reads the organization name, aliases, and internal domains
from **Settings ▸ Team**, plus the names and email addresses of active workspace
users. Those identities are treated as internal, including when a teammate
forwards an external message, and are never suggested as external
counterparties. Managers can update the shared identity settings when the
organization adds another operating name or email domain.

Use **Reprocess thread** for correspondence captured before these checks existed
or when forwarded context was initially missed. Use **Reprocess this email** on
an expanded message to rerun only that message without rescanning its siblings.
Afterward, the message keeps a short result beneath the button and the toast says
where anything new was placed. Project, counterparty, grant, task, and rights
document suggestions appear in the thread's review area above the messages;
print quote or invoice suggestions (including suggestions read from attached
PDFs) and restored proofs appear on the linked project's
**Print** tab. A print correspondence match by itself does not create a review
item, and the result says so explicitly.
Reprocessing reruns project, publisher/rights, funding-partner, printer, and
quote matching, then reruns the AI project and counterparty review for the
selected scope. Quoted copies inside ordinary replies are removed first;
deliberate forwarded histories remain available because they may be the only
captured copy. On a whole-thread reprocess, only still-pending suggestions are
replaced after a successful fresh review; reprocessing one email preserves
pending suggestions from its siblings. Projects you already created and
suggestions you dismissed are left alone, so a reprocess never re-suggests or
duplicates them. It also checks older forwarded messages and direct
proof-approval emails for task suggestions.
On print-linked messages, it can also restore an attached PDF proof that an older
capture skipped; the proof then appears as a private download on the project
Print tab. Reprocessing is deliberately review-only: even an explicit old note
cannot create a task without a manager reviewing it.

When a linked printer email contains a proof attachment and asks for approval,
the print run advances to **Proofing** and the thread shows an editable
**Suggested project status update**. The suggestion summarizes that the proof is
ready for review. A manager must choose **Post update** before it appears on the
project overview, or dismiss it with no project update. This never changes the
project lifecycle status automatically. If exactly one active teammate is in
the message's **To** field, Sastra also suggests an undated, medium-priority task
for that teammate to review the proof and reply to the printer. **Cc** recipients
do not imply assignment. The teammate reviews the task from the notification
bell or the top of **My Work**; nothing is added to their task board until they
approve it.

## Signed agreements and license-fee receipts

When a project-linked email has a PDF that looks like a signed MoU, signed
license, or license-fee payment receipt, Sastra checks that one attachment and
adds a review card to the thread. Ordinary email and unrelated attachments do
not trigger document extraction. The suggested agreement step, holder, signed
date, territory, formats, or payment can be corrected before approval.

This workflow is always review-first. A detected agreement does not mark Rights
complete, and a receipt does not mark a fee paid, until a manager selects
**Approve rights update** or **Approve payment**. Approval attaches the original
PDF to the rights step or payment, completes the matching open task when there
is one, and refreshes project blockers. Dismiss removes only the suggestion.

When one signed agreement covers several projects, link the email to every
project first. The agreement review shows those projects as checked boxes.
Uncheck any project the agreement does not cover, then select **Approve rights
update** once. Sastra updates the selected Rights records and attaches the same
PDF to each one. The projects must stay linked to the email until approval.
For an older email where one linked project already has the approved agreement,
use **Reprocess thread**. Sastra reuses that reviewed agreement for the other
linked projects and shows the project checklist again.

Known publisher/contact relationships and the project title in the current
message are used to link a thread automatically. When several projects share a
publisher, Sastra only chooses among that verified set and only when the message
uniquely identifies one. If a manager links the project manually, the same
document check runs after linking; reprocessing can also run it for older
captured threads. A payment receipt needs an unpaid license-fee entry on the
project's Rights page so the manager can choose which fee it settles. If the
project has no fee record yet, the manager can verify the receipt amount and
currency and create the initial paid fee record during approval.

When a thread is linked, each linked project appears above the email subject as a
direct link to that project's overview, and the thread shows under **every**
linked project's correspondence. Adding or removing links in the Projects field
updates both.

Only project-linked inbound email raises an in-app notification; unlinked mailbox
noise (like provider security alerts) stays in the **Other** filter and doesn't
notify anyone.

Connect the mailbox in **Settings ▸ Email**. Replies, quote requests, and
invoices are sent from the correspondence address, through the Gmail mailbox or
through the workspace's email provider.

### Shared funding review

Project-linked agreement PDFs also use the document importer to detect incoming
funding. **Review MoU funding** opens one review per source document. Map the works
to existing projects, verify allocations and installments, and choose an eligible
invoice owner. Previously approved rights can still receive a missing funding
review when reprocessed. Funding approval does not alter project budgets or rights.
See **Shared MoU funding** for delivery confirmation and reviewed invoice sending.

Search by email subject or linked project title. Pages show up to 50 emails. Category changes keep your search, project, and status filters. Use Clear project filter to remove only the project, or Clear filters to reset the search and status too.
