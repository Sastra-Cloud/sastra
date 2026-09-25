---
title: "Chat"
category: "Communication"
roles: [member, manager, admin]
keywords: [chat, channel, message, mention, general, react, pin, attachment, audio, voice message, microphone, recording, transcript, direct message, dm, private message, loading, unread, search, recent projects, members, add member, remove member, private channel]
order: 80
summary: "Project chat, member-scoped team channels, direct messages, voice recordings, mentions, and attachments."
---

Chat is real-time messaging for the team. Every project has focused channels,
**#general** is shared with the whole workspace, selected teammates can
collaborate in private team channels, and two people can talk privately in a
one-to-one direct message.

Sent messages appear in the thread immediately with a **sending** or
**uploading** state. If delivery fails, the composer text and selected files are
restored so you can retry. Reactions, read state, pins, and confirmed message
deletes also update immediately and roll back if saving fails.

## Getting around

The chat sidebar lists **direct messages**, **team channels**, and active
projects. Completed and cancelled projects are kept out of this working list.
Use **Find a conversation** to filter the sidebar by teammate, team channel,
project, or project channel.

Pinned projects stay anchored at the top. Unpinned projects with unread messages
appear under **New activity**, ordered by the latest message, followed by
**Recent projects**. Unread names use stronger text and a count badge, and a
project shortcut opens its unread channel first. To keep large workspaces
scannable, the recent list starts with the latest projects; select **Show more**
to reveal the rest.

Use the plus button beside **Direct messages** to search for a teammate. Opening
the same teammate again returns to the existing private conversation.

Managers and admins can use the plus button beside **Team** to create a private
team channel. Give the channel a name and select its initial members; the
creator is included automatically. Only members can find the channel, open its
history, receive its mentions, or access files attached there.

Inside a private team channel, select the **members** button in the channel
header to view the roster. Managers and admins can add active teammates
immediately. Removing someone asks for confirmation, then removes the channel
from their sidebar and revokes access to its messages and files. The manager
making the change cannot remove themselves. Existing custom channels retain
their current audience when this feature is enabled, while **#general** remains
available to everyone.

When a conversation takes a moment to open, the message area shows **Loading
messages…** immediately while the conversation list and surrounding chat
workspace stay in place. The composer is temporarily unavailable so a message
cannot accidentally be sent to the previous channel.

On a phone, an open conversation stays within the visible screen like a
messaging app: the message history scrolls independently, while the compact
conversation header and composer remain reachable. The composer follows the
on-screen keyboard and leaves room for the device safe area.

## In a channel

- **@mention** a teammate to notify them: type **@**, pick a name from the
  picker, and they get a notification linking back to your message. See
  **@mentions**.
- Attach files inline, add **reactions**, and **pin** important messages.
- Select the **microphone** to record a voice message of up to ten minutes.
  Stop the recording to review it, listen before sending, record it again, or
  discard it. You can add a short note or transcript before sending so the
  message is useful without audio. Recordings are compressed for speech before
  upload, voice uploads show real progress, and failed uploads remain available
  to retry. Sent voice messages use a simple play button, waveform scrubber,
  and elapsed time directly in the conversation.
- Read tracking shows what's new since you last looked.

Direct messages use the same composer, attachments, voice recordings,
reactions, and read tracking as channels. Only the two participants can open
the thread or its attached files; add/remove member controls apply to private
team channels rather than turning a direct message into a group conversation.

Voice recordings are stored as private workspace file attachments. Sastra
serves playback and downloads through authenticated links rather than exposing
the storage object directly.

Standup answers are posted into a standup channel automatically, so check-ins
live alongside normal conversation. Creating channels and changing their
membership are manager actions.
