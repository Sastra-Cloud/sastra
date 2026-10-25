---
title: "Lectio translation projects"
category: "Publishing"
roles: [member, manager, admin]
keywords: [Lectio, translation, integration, workflow, connect, disconnect, sync, chapters, assignment, translated files, reopen, team, project defaults, schedule, deadlines, start date, Sastra Cloud, paid, self-hosted, modules, shared sign-in, link account, different emails, match teammates, ownership, administrator approval, connection history]
order: 65
summary: "Connect eligible managed Sastra to Lectio, review possible project matches before syncing, link accounts with different emails, and manage shared schedules."
---

## Connect your team

The integration requires an active, paid Sastra Cloud workspace or a deployment
explicitly managed and approved by the Sastra operator. Other self-hosted instances
and trial, past-due, suspended, or cancelled Cloud subscriptions cannot connect. Lectio checks eligibility during setup and ongoing integration work. If a check
is unavailable, synchronization waits; your existing translations and Sastra records stay saved.

On self-hosted instances, **Settings → Modules** explains this requirement and
prevents enabling Lectio. **Settings → Lectio** shows the same notice instead of
connection controls. The New project form also omits connection controls while Cloud
eligibility is unavailable. If Lectio was already enabled, you can still turn it off.

Use Sastra 0.5.1 or later. Lectio verifies directly with your Sastra server that
an active administrator started the setup request. An address pasted into a URL
cannot approve a workspace. If verification fails, restart setup from Sastra Settings
and ask its administrator to update Sastra if needed.

A Sastra administrator enables **Lectio** in **Settings → Modules**, then opens
**Settings → Lectio** and enters the Lectio app address. A Lectio team administrator
signs in there, checks the displayed Sastra workspace, explicitly selects the team,
and reviews its name, team ID, and owner before approving the connection.
Each Lectio team can connect to one Sastra workspace. A Sastra workspace can connect
several Lectio teams. Other teams and projects keep their existing workflows.

The module is off by default. Disabling it pauses integration actions and hides the
integration screens; it preserves existing links and history. To make linked tasks
editable independently, disconnect their project before disabling the module.

## Link an existing project

Existing projects start **not connected**, even after their team is linked. No projects
are automatically matched or copied. Open a Sastra project's **Translation** tab and
turn on **Connected to Lectio**, or use **Connected to Sastra** on the Lectio project.
Choose the connected team when there is more than one.

The review dialog checks existing projects first. Compare the title, languages, and
project ID; a suggested match never connects automatically. Choose an existing project,
or explicitly choose **Create a separate project** if none is right. Cancel leaves both
projects unchanged. You need permission to manage the project; checking from Lectio also
requires your verified account link and management access to the Sastra project.

An existing-project choice opens workflow mapping in Sastra. Match every Lectio step to a
Sastra phase, or choose **Keep only in Lectio**. Several steps can share a phase; its
task finishes only when every mapped step finishes.

Choose **Reuse existing project units** when a document already has a Sastra unit.
A single task in each mapped phase is reused with its dates and history; Lectio then
manages its progress and assignment. Ambiguous task matches require review.
Unmatched documents receive new units and tasks. The initial import is quiet: completed historical work does
not send new handoff alerts.

Under **Settings → Lectio**, an administrator can confirm which existing account in
each app belongs to the same person. Matching does not grant project access. A local
assignee must be active and already belong to the Sastra project. Unmatched people
remain visible by name in the translation overview.

The email addresses in the two apps do not need to match. Use **Match teammates**
to choose the same person's existing accounts. Review both names and emails, then
choose **Confirm teammate match**. This match does not link sign-in or grant a role.

To correct a mistake, choose **Remove match** and review the confirmation. Sastra
refreshes affected assignments and stops pending requests using the old match.
Accounts, completed work, files, and history stay saved. You can remove a match
while synchronization is paused. If shared sign-in already verifies that match,
the person must first use their usual Sastra login and **Unlink shared sign-in**
in Profile. An administrator cannot move a verified sign-in identity to someone else.

## Link sign-in to your existing Lectio account

Your server administrator must first enable shared sign-in for the deployment.
A Sastra administrator can then choose **Enable shared sign-in** in **Settings →
Lectio** for the connected team. Each person opens **Settings → Profile → Link
Lectio**, signs in to their existing Lectio account, and reviews both accounts in
Sastra. Their emails can be different. Select **These accounts are mine**, then
**Link these accounts**. Nothing is linked until this final confirmation.

This links two existing accounts. It does not create accounts, add members, or
match people automatically by email. Your normal Sastra login stays available.
Choose **Cancel linking** to leave both accounts unchanged. **Use another Lectio
account** cancels the review and opens Lectio. Sign out there, sign in to the
intended account, then start linking again from Sastra Profile. Reviews expire
after five minutes and work only in the Sastra session that started them.
If the connection is revoked or your Lectio team membership is removed, sessions
created through shared sign-in end. Your independent Sastra login is retained.

## Create connected projects

In **Connected project defaults**, review a Sastra project template, a Lectio team
workflow, and their stage mapping. Choose the next publishing stage and whether completed
translations should be delivered. Changes to defaults apply to new connected projects;
existing project mappings and dates keep their reviewed values.

New Lectio projects created from Sastra belong to the connected team's
owner. That owner's plan and file-space limits apply consistently. Approving a
connection does not make the approving administrator the project owner. Existing
projects keep their owners. Projects created directly in Lectio keep their normal
Lectio owner, including when they create a matching Sastra project.
Only translation resources explicitly shared with that Lectio team are attached
automatically. The owner's personal resources and other teams' resources stay private.

If an approving administrator leaves, a current administrator can choose
**Review administrator approval → Approve connection as me** in Sastra. In Lectio,
use **Review connection approval** in the team's Security settings. Reapproval
preserves existing project links and records the new approval. If the Lectio team
owner changed, new-project creation is turned off until it is reviewed and enabled
again. Use **View connection history** in Sastra or **Connection history** in
Lectio to review approvals and connection state changes. Teammate-match and
account-link changes appear in Sastra's connection history.
An administrator can also **Cancel pending connection** if setup was interrupted.
This releases the team for fresh approval; an old approval cannot restore it.

The Sastra **New project** form supports book and article projects. **Connected to Lectio**
defaults on when a team is linked; **Connected to Sastra** behaves the same way in Lectio's
**New project** form. Turn it off to create only the native project. With several linked
teams in Sastra, choose the intended team explicitly.

Creating a connected project checks for existing matches before creating anything.
Choose an existing counterpart or explicitly create a separate one. Selecting an existing
counterpart creates only your new native project, then opens Sastra's mapping review.
Creating a separate counterpart uses the approved defaults and queues setup in the background.
The project's Translation tab shows progress and offers **Sync now** to retry preparation.
A Lectio administrator must first allow creation from Sastra under the team's **Security**
settings. Existing Lectio plan limits still apply.

Both administrators must approve creation from the reviewed defaults before a separate
counterpart can be created. Without that approval you can still choose an authorized existing
project, or turn the connection off. Connecting an existing project to a newly created
counterpart waits for mapping review before synchronization starts. Projects created through
document import or AI planning remain separate; use their Translation tab to review a connection.
The integration does not buy seats or grant memberships.

## Follow translation and publishing work

Lectio owns document progress, translation status, and translation assignees. Change these
in Lectio. Sastra owns publishing deadlines, priority, budget, rights, print work, and project
completion. Calendar deadlines sent to Lectio retain the Sastra workspace timezone.

## Set dates from Lectio

On a linked Lectio project's **Documents** tab, open **Edit schedule** under
**Translation schedule**. Set the project start date, project deadline, and deadlines
for its linked translation tasks. **Save schedule** saves the dates in Sastra and shows
the confirmed result in Lectio. Clear a date field to remove that deadline.

You need workflow-management permission in Lectio, a verified account link from
Sastra Profile, and project-management permission in Sastra. An administrator's
teammate match alone cannot delegate your authority. Linking accounts does not
grant either application's permissions.
All dates use the Sastra workspace timezone. Grouped workflow steps share one task deadline.

If another person changes the dates or task mapping while your form is open, saving
stops without overwriting their changes. Your entered dates remain visible. Use
**Reload schedule**, review the latest dates, and enter your changes again. Scheduling
requires an internet connection. Deliberately set or cleared task deadlines remain
protected from automatic publishing handoffs.

## Publishing handoffs

If a next publishing stage was selected, new translation completions can assign its
coordinator, fill an empty deadline, and notify the assignee once. A manually chosen
deadline is preserved. Translation completion never closes the Sastra project or changes
an invoice or budget.

If file delivery is enabled, completed translations attach to the project and its next-stage
tasks. Files are delivered only after the document's full Lectio workflow is complete.
DOCX and ODT keep their formats; IDML sources deliver a DOCX translation. Native IDML
exports remain in Lectio. New revisions are separate files, so earlier publishing files
are not overwritten. Subtitle and video workflows are outside this integration.

## Review changes and recover

When completed translation work reopens in Lectio, Sastra asks a project manager to
**Reopen Sastra task** or **Keep completed**. Review downstream work first. Sastra does
not silently undo completed publishing work.

If the workflow adds or removes stages, use **Review workflow mapping**. Keeping a phase
reuses its tasks and dates; selecting a new phase creates new tasks and preserves the
older task history. An unavailable source leaves the last synchronized state visible.

Administrators can pause synchronization in either app. Resume it in the app where it
was paused. Deliveries retry automatically after temporary failures.

Turn off **Connected to Lectio** or **Connected to Sastra**, then confirm **Disconnect project**.
This preserves tasks, files, dates, and history and releases translation tasks for local editing.
To reconnect, review the original project pair; the integration reuses it and its history.
If disconnection is still being delivered, wait and retry the match review. Cancelling an
unfinished creation cannot later create a duplicate counterpart.
**Disconnect team** stops all of that team's project links and
requires fresh administrator approval before reconnecting. Disconnection takes effect
locally first and is delivered to the other app with retries if it is temporarily offline.

## Assign work from Sastra

On a connected project's **Translation** tab, choose a document, workflow step,
and matched project teammate under **Assign translation work**. Both your account
and the assignee's account must be matched in Settings → Lectio. You must also be
a project manager in Lectio; matching accounts never grants that role.

The request is saved for automatic delivery. Lectio assigns unstarted work when
the current workflow still matches the request. A changed workflow, existing
worker, started step, or split document creates an **Assignments to review** item
on the Lectio project instead. Review its normal workflow assignments there and
mark the request reviewed. Sastra updates from the resulting Lectio workflow.

## Share source documents

Attach a DOCX, ODT, or IDML source file to the Sastra project, then choose it under
**Send a source document** on the Translation tab. **Share and import in Lectio**
authorizes that attachment revision for the connected team. Other attachments
remain private to Sastra. Files must be no larger than 50 MB.

The import checks its checksum, file format, expanded archive size, the requester's
Lectio permissions, and the project owner's plan and storage limit. It creates the
normal Lectio document and workflow, waiting for a person to start preparation;
sharing a file does not automatically spend preparation credits. Repeating an
import renews its seven-day access grant without creating another document.
Disconnecting stops new downloads; a document already imported remains in Lectio.

## Rotate connection keys

A workspace administrator can use **Rotate connection keys** in Settings → Lectio.
Both apps replace their signing keys through their delivery queues. Pending deliveries
continue to work with the previous key for up to 24 hours. Rotation preserves linked
projects and does not sign users out.
