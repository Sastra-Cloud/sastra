---
title: "Chat"
category: "Communication"
roles: [member, manager, admin]
keywords: [chat, channel, message, mention, general, react, pin, pin message, pinned, pinned messages, unpin, unpin message, pin project, attachment, audio, voice message, microphone, recording, transcript, direct message, dm, private message, loading, unread, search, recent projects, members, add member, remove member, private channel, standup conversation]
order: 80
summary: "Project chat, member-scoped team channels, direct messages, pinned messages, voice recordings, mentions, and attachments."
---

Chat is real-time messaging for the team. Every project has focused channels,
**#general** is shared with the whole workspace, selected teammates can
collaborate in private team channels, and two people can talk privately in a
one-to-one direct message.

Sent messages appear in the thread immediately with a **sending** or
**uploading** state. If delivery fails, the composer text and selected files are
restored so you can retry. Reactions, message pins, project pins, and confirmed
message deletes also update immediately and roll back if saving fails. Unread
counts clear as soon as you open a conversation.

## Getting around

The chat sidebar lists **direct messages**, **team channels**, and active
projects. Completed and cancelled projects are kept out of this working list.
Use **Find a conversation** to filter the sidebar by teammate, team channel,
project, or project channel.

Select the pin button beside a project (**Pin project**) to keep it at the top
of your sidebar; select it again (**Unpin project**) to let it move. Project
pins are only for you. Pinned projects stay anchored at the top. Unpinned
projects with unread messages
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
- Attach files inline, add **reactions**, and **pin** important messages so
  everyone can find them again. See **Pinned messages** below.
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

Standups also use chat. At the scheduled time, the standup bot opens your
standup conversation and asks the first question. You get a notification, and
the **Standups** page shows **Your standup is waiting** with **Answer now**.
Reply in that conversation: each reply saves your answer, and the bot asks the
next question until the check-in is done. Standup conversations are not listed
in the chat sidebar. Your standup conversation is private: only you can open it,
along with its files and pins. Your answers are not posted to a team channel;
they feed the standup summary on the **Standups** page.

Creating channels and changing their membership are manager actions.

## Pinned messages

Pin a message when the whole conversation should be able to find it again, for
example a decision, a final file, or an important date.

- **Pin a message:** select the **pin** button under the message (**Pin
  message**). On a computer, point at the message to show its buttons. On a
  phone, the buttons are always shown under each message.
- A pinned message shows **Pinned by** and the teammate's name, or **Pinned by
  you**.
- **Unpin a message:** select the same button again (**Unpin message**), or use
  **Unpin message** in the Pinned list.
- **See all pins:** select **Pinned** in the conversation header. The number
  beside it shows how many messages are pinned. The newest pin is first. The
  list keeps the newest 50 pins; when it is full, the number shows **50+**. Each
  pin shows who wrote the message, when it was sent, the start of its text (or
  **Voice message** or the file name), and who pinned it and when. The
  **Pinned** button is in the header of every conversation in **Chat** and on a
  project's **Chat** tab.
- **Go to a pinned message:** select **Show in chat** (or the message in the
  list). The chat scrolls to the message and highlights it for a moment. A pin
  on an older message that is not in the recent messages stays in the list, but
  the chat cannot scroll to it.

Pins are shared with everyone in the conversation. Anyone who can read a
conversation can pin or unpin its messages: project channels, **#general**,
private team channels you belong to, and your direct messages. If you are
removed from a private team channel, you can no longer see or change its pins.
Deleting a pinned message also removes its pin. Pinning and unpinning do not
send notifications.

The assistant can list pinned messages, for example "what is pinned in
#general?". It can also unpin a message after you approve it. It cannot pin
messages for you; use the pin button on the message.

## Assistant shortcut

In a conversation, use the assistant shortcut in the header. The assistant launcher does not float over Send. Project chat keeps the conversation and composer inside the available screen height.
