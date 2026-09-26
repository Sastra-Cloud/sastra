---
title: "Private wiki & tutorials"
category: "Work"
roles: [member, manager, admin]
keywords: [wiki, tutorial, knowledge base, documentation, assistant, ai, semantic search, subject, page, draft, publish, revision, image, video, mp4, r2, compression, bitrate, preview, poster, youtube, vimeo, loom, embed, captions, search, private, trash]
order: 24
summary: "Create, publish, search, and securely share structured internal tutorials."
---

The **Wiki** is the team's private knowledge base for repeatable processes and
structured tutorials. Open it from **Workspace ▸ Wiki**. Every active teammate
can read and search published pages. Managers and admins can organize subjects,
create drafts, upload private media, and publish revisions.

Wiki pages are not public links. The app checks the signed-in user's role before
serving a page, image, or private video. Published text is kept separately from
the working draft, so an unfinished edit never changes what members read.

## Browsing and searching

Subjects are broad areas, with pages nested beneath them. On desktop, use the
wiki browser on the left. At narrower laptop, tablet, and phone widths, select
**Browse wiki** to open the same navigation without squeezing the editor or
reader. Select a subject name or its chevron to collapse or expand its pages;
the browser remembers those choices while you move through the Wiki and opens
the subject containing the current page. This adapts to the space beside the
main app sidebar, so collapsing that sidebar may restore the persistent Wiki
browser. Search matches subject names, page titles, summaries, and page text.
Managers can also find unpublished drafts; members only see published material.

You can also ask the **Sastra Assistant** about an internal tutorial or process.
It searches only current published revisions, quotes the relevant text, and links
you to the matching Wiki page or section. Drafts and superseded revisions are
excluded for every role, including managers. Keyword search is available as soon
as a page is published; semantic matching is added in the background and retries
automatically if the AI provider is temporarily unavailable.

## Creating a tutorial

Managers select **Create subject** at the top of the Wiki, or the **plus** beside
Wiki in the browser, to create a subject. Then use the visible **page-plus**
control beside a subject—in the Wiki browser or on the Wiki home page—to add a
page. The tutorial template starts with sections for an overview, prerequisites,
steps, and troubleshooting. A blank page is also available.

The editor supports headings, paragraphs, text emphasis, bulleted and numbered
lists, checklists, quotes, code blocks, callouts, links, images, private video,
and approved external video embeds. The file-video toolbar control uploads a
private MP4, while the play-in-a-square control embeds YouTube, Vimeo, or Loom.
To change an existing external video while the page is a draft, select **Edit
embed** on its placeholder. The same dialog opens with the current URL and
caption, and **Save changes** updates that embed in place.
Draft edits save automatically. The status beneath the editor tells you whether
it is waiting, saving, or saved. Select **Cancel** to finish any pending save and
leave the editor without publishing. An existing published page opens for
reading; an unpublished draft returns you to the Wiki home page.

If another browser saves a newer draft, the editor stops autosaving and keeps
the current tab's text visible. Reload only when you are ready to use the latest
saved draft.

## Images and private video

Images may be JPEG, PNG, or WebP and up to 20 MB. The app validates the image,
removes its metadata, resizes oversized images, converts it to WebP, and stores
the compressed result in private object storage. Add useful alt text when the
image communicates information; leave alt text empty only for decoration.

Private video uploads must be MP4 files that the uploader's browser can decode.
They may be up to 500 MB, 30 minutes, 4K resolution, and an average bitrate of 8
Mbps. Sastra checks those limits before uploading; MOV, WebM, MKV, higher-bitrate,
or otherwise incompatible videos must be converted or compressed first. Accepted
videos upload directly to private R2 storage, and Sastra captures a first-frame
preview so the player does not appear as a black rectangle before playback.

Uploaded videos do not receive automatic captions. Captions are optional: for a video
with speech you can upload a WebVTT caption file, or mark the video as having no
spoken audio, but neither is required. A video only needs to finish processing
before it can be published.

Video titles, page text, image alt text, and media captions are searchable. The
assistant does not watch or transcribe a video, so a video-only result directs
you to the tutorial without inventing what the video says.

You can also embed a YouTube, Vimeo, or Loom tutorial by URL. These are external
services: opening a page with an embed may send the viewer's network information
and the Sastra site's origin to that provider. The private Wiki page path is not
included in the cross-origin referrer. Other sites should be added as ordinary
links and open in a new tab.

## Publishing and revisions

Select **Publish** when the draft is ready. Publishing creates an immutable
revision and atomically makes that revision visible to members. If media is
still processing, publishing stays blocked until it finishes and explains what
remains. Captions are optional and never block publishing.

Use **History** to review prior published revisions. **Restore to draft** copies
an old revision into the working draft; it does not change the published page
until you publish again.

## Reordering and trash

Managers can use the arrow controls that appear beside subjects and pages to
change their navigation order. Moving a page to trash removes it from the wiki
immediately after confirmation. Open **Wiki ▸ Trash** to restore it.

Private media usage appears at the bottom of the Wiki home page for managers.
This helps the team monitor compressed image storage, private private video space,
and video duration before costs become surprising.

The empty Wiki offers managers Create subject directly. Private video space shows the space used by uploaded videos.
