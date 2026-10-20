import { Children, isValidElement, useEffect, type ReactNode, type DragEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteMessage, markChannelRead, postMessage, setMessageStatus, toggleReaction } from "@/lib/chat/actions";
import type { ChatMessageView } from "@/lib/chat/queries";
import { confirmDialog } from "@/lib/dialog-requests";
import { toast } from "sonner";
import { ChatThread } from "./chat-thread";
import { editMessage } from "@/lib/chat/edit-actions";
import type { MessageEditDraft } from "@/lib/chat/edit-state";

// Exercise the thread's event handlers in the repository's Node test environment.
// Retain hook state across explicit renders without mounting browser-only children.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: vi.fn(),
  useCallback: (callback: unknown) => callback,
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
}));
vi.mock("@/hooks/use-user-active", () => ({ useUserActive: () => false }));
vi.mock("@/components/chat/chat-navigation-context", () => ({
  useChatNavigation: () => ({ pendingChannelId: null }),
}));
vi.mock("@/components/chat/message-pins", () => ({
  useMessagePins: () => ({ beginPinsFetch: () => vi.fn(), pinFor: vi.fn(), isPending: () => false, forgetMessage: vi.fn() }),
}));
vi.mock("@/lib/dialog-requests", () => ({ confirmDialog: vi.fn() }));
vi.mock("@/lib/chat/edit-actions", () => ({ editMessage: vi.fn() }));
vi.mock("@/lib/chat/actions", () => ({
  postMessage: vi.fn(), setMessageStatus: vi.fn(), markChannelRead: vi.fn(),
  deleteMessage: vi.fn(), toggleReaction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function elements(node: ReactNode): Array<React.ReactElement<Record<string, unknown>>> {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}

function render(loading = false, initialMessages: ChatMessageView[] = []) {
  hooks.cursor = 0;
  const tree = ChatThread({
    channelId: "channel", currentUserId: "me", currentUserName: "Teammate",
    currentUserImage: null, initialMessages, loading, timeZone: "UTC",
  });
  const all = elements(tree);
  return {
    thread: all.find((element) => "data-chat-thread" in element.props)!.props as React.ComponentProps<"section">,
    files: all.filter((element) => element.props.file instanceof File),
    dropHint: all.some((element) => element.props.children === "Drop files to attach"),
    alerts: all.filter((element) => element.props.role === "alert").map((element) => Children.toArray(element.props.children as ReactNode).join("")),
    send: all.find((element) => element.props["aria-label"] === "Send")?.props ?? {},
    composer: all.find((element) => "placeholder" in element.props)?.props ?? {},
    editor: all.find(element => "draft" in element.props && "onSave" in element.props)?.props as { draft: MessageEditDraft; onSave: () => void; onCancel: () => void; onChange: (text: string) => void } | undefined,
    rows: all.filter((element) => "m" in element.props).map((element) => element.props as {
      m: ChatMessageView; reactionPending: boolean; editPending: boolean; onEdit: () => void; onReact: (emoji: string) => void; onDelete: () => Promise<void>;
    }),
  };
}

function drag(files: File[] = [], types = ["Files"]) {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types, files, dropEffect: "none" },
  } as unknown as DragEvent<HTMLElement>;
}

const powerpoint = () => new File(["slides"], "presentation.pptx", {
  type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
  vi.mocked(postMessage).mockResolvedValue({ id: "message" });
  vi.mocked(setMessageStatus).mockResolvedValue(undefined);
  vi.mocked(confirmDialog).mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

it("records a visit when a cached conversation reopens with already read messages", () => {
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
    cancelAnimationFrame: vi.fn(),
  });
  const message: ChatMessageView = {
    id: "last-message", userId: "me", authorName: "Teammate", authorImage: null,
    content: "Hello", status: "sent", createdAt: "2026-10-20T09:00:00.000Z",
    isMine: true, reactions: [], attachments: [], editedAt: null,
  };
  render(false, [message]);
  const enterConversation = vi.mocked(useEffect).mock.calls.find(
    ([, dependencies]) => dependencies?.[0] === "channel" && dependencies?.[1] === message.id
  )![0];

  enterConversation();
  vi.mocked(markChannelRead).mockClear();
  // React reconnects effects when a cached route becomes visible again.
  enterConversation();

  expect(markChannelRead).toHaveBeenCalledWith("channel", message.id);
});

describe("chat file drops", () => {
  it("keeps the drop hint visible across nested elements and clears it on exit", () => {
    render().thread.onDragEnter!(drag());
    expect(render().dropHint).toBe(true);
    render().thread.onDragEnter!(drag());
    render().thread.onDragLeave!(drag());
    expect(render().dropHint).toBe(true);
    render().thread.onDragLeave!(drag());
    expect(render().dropHint).toBe(false);
    render().thread.onDragLeave!(drag());
    render().thread.onDragEnter!(drag());
    expect(render().dropHint).toBe(true);
  });

  it("adds multiple files, including PowerPoint, without uploading or changing text", () => {
    const first = powerpoint();
    const second = new File(["notes"], "notes.txt", { type: "text/plain" });
    (render().composer.onChange as (text: string) => void)("Draft message");
    render().thread.onDragEnter!(drag());
    const over = drag();
    render().thread.onDragOver!(over);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe("copy");
    const drop = drag([first, second]);
    render().thread.onDrop!(drop);
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(render().files.map((element) => element.props.file)).toEqual([first, second]);
    expect(render().composer.value).toBe("Draft message");
    expect(render().dropHint).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    render().thread.onDrop!(drag([second]));
    expect(render().files).toHaveLength(3);
    (render().files[0].props.onRemove as () => void)();
    expect(render().files.map((element) => element.props.file)).toEqual([second, second]);
  });

  it("leaves text and link drags to the browser", () => {
    const event = drag([], ["text/plain", "text/uri-list"]);
    const { thread } = render();
    thread.onDragEnter!(event);
    thread.onDragOver!(event);
    thread.onDrop!(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(render().dropHint).toBe(false);
    expect(render().files).toHaveLength(0);
  });

  it("blocks file navigation and draft changes while a conversation loads", () => {
    const event = drag([powerpoint()]);
    const { thread } = render(true);
    thread.onDragEnter!(event);
    thread.onDragOver!(event);
    thread.onDrop!(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe("none");
    expect(render(true).dropHint).toBe(false);
    expect(render(true).files).toHaveLength(0);
  });

  it.each([false, true])("keeps upload feedback and recoverable files (failure: %s)", async (fail) => {
    let finishUpload!: (response: Response) => void;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/recent")) return Response.json({ messages: [], pins: [] });
      if (url.endsWith("/presign")) return new Promise<Response>((resolve) => { finishUpload = resolve; });
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = powerpoint();
    render().thread.onDrop!(drag([file]));
    (render().send.onClick as () => void)();
    expect(render().send.disabled).toBe(true);
    expect(render().files[0].props.sending).toBe(true);
    const blockedDrop = drag([powerpoint()]);
    render().thread.onDrop!(blockedDrop);
    expect(blockedDrop.preventDefault).toHaveBeenCalled();
    expect(render().files).toHaveLength(1);
    await vi.waitFor(() => expect(finishUpload).toBeTypeOf("function"));
    finishUpload(fail
      ? Response.json({ error: "Upload failed. Try again." }, { status: 400 })
      : Response.json({ fileId: "file", uploadUrl: "https://uploads.test/file" }));
    await vi.waitFor(() => expect(setMessageStatus).toHaveBeenCalledWith("message", fail ? "failed" : "sent"));
    await vi.waitFor(() => expect(render().files.every((element) => !element.props.sending)).toBe(true));
    expect(render().files.map((element) => element.props.file)).toEqual(fail ? [file] : []);
    if (fail) expect(toast.error).toHaveBeenCalledWith("presentation.pptx: Upload failed. Try again.");
    else expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/files/complete");
  });
});

const savedMessage = (): ChatMessageView => ({
  id: 'saved', userId: 'me', authorName: 'Teammate', authorImage: null,
  content: 'Review the headings', createdAt: '2026-10-19T10:00:00Z', editedAt: null, status: 'sent',
  isMine: true, attachments: [], reactions: [{ emoji: '👍', count: 1, mine: false }],
});

describe('conversation action feedback', () => {
  it('keeps the normal draft and files when editing is cancelled', () => {
    const file = powerpoint();
    (render(false, [savedMessage()]).composer.onChange as (text: string) => void)('Keep this draft');
    render().thread.onDrop!(drag([file]));
    render().rows[0].onEdit();
    expect(render().editor?.draft.text).toBe('Review the headings');
    render().editor!.onChange('An unsaved correction');
    render().editor!.onCancel();
    expect(render().composer.value).toBe('Keep this draft');
    expect(render().files.map(element => element.props.file)).toEqual([file]);
    expect(render().rows[0].m.content).toBe('Review the headings');
    expect(editMessage).not.toHaveBeenCalled();
  });
  it.each([false, true])('edits immediately and settles or restores the editor (failure: %s)', async fail => {
    let finish!: (value: Awaited<ReturnType<typeof editMessage>>) => void;
    let reject!: (error: Error) => void;
    vi.mocked(editMessage).mockImplementation(() => new Promise((resolve, failed) => { finish = resolve; reject = failed; }));
    (render(false, [savedMessage()]).composer.onChange as (text: string) => void)('Keep this draft');
    render().rows[0].onEdit();
    render().editor!.onChange('Corrected text');
    const save = render().editor!.onSave;
    save(); save();
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(render().rows[0].m.content).toBe('Corrected text');
    expect(render().rows[0].m.editedAt).toBeTruthy();
    expect(render().rows[0].editPending).toBe(true);
    expect(render().composer.value).toBe('Keep this draft');
    if (fail) reject(new TypeError('Failed to fetch'));
    else finish({ ok: true, data: { id: 'saved', content: 'Corrected text', editedAt: '2026-10-20T10:00:00Z' } });
    await vi.waitFor(() => expect(render().rows[0].editPending).toBe(false));
    expect(render().rows[0].m.content).toBe(fail ? 'Review the headings' : 'Corrected text');
    if (fail) {
      expect(render().editor?.draft.text).toBe('Corrected text');
      expect(render().editor?.draft.error).toContain('Could not save');
      expect(render().rows[0].m.editedAt).toBeNull();
      render().editor!.onCancel();
      expect(render().composer.value).toBe('Keep this draft');
    } else expect(render().rows[0].m.editedAt).toBe('2026-10-20T10:00:00Z');
  });
  it('does not start editing another person’s message', () => {
    render(false, [{ ...savedMessage(), userId: 'someone-else', isMine: false }]).rows[0].onEdit();
    expect(render().editor).toBeUndefined();
  });
  it.each([false, true])('shows a pending text message and settles or restores the draft (failure: %s)', async (fail) => {
    let finish!: (value: { id: string }) => void;
    let reject!: (reason: Error) => void;
    vi.mocked(postMessage).mockImplementation(() => new Promise((resolve, fail) => { finish = resolve; reject = fail; }));
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ messages: [savedMessage()], pins: [] })));
    (render().composer.onChange as (text: string) => void)('Review the headings');
    (render().send.onClick as () => void)();
    expect(render().rows[0].m.id).toMatch(/^pending-/);
    expect(render().rows[0].m.status).toBe('uploading');
    expect(render().composer.value).toBe('');
    expect(render().send.disabled).toBe(true);
    if (fail) reject(new Error('Please retry.'));
    else finish({ id: 'saved' });
    await vi.waitFor(() => expect(render().send.disabled).toBe(fail ? false : true));
    await vi.waitFor(() => expect(render().rows.some(row => row.m.id.startsWith('pending-'))).toBe(false));
    if (fail) {
      expect(render().composer.value).toBe('Review the headings');
      expect(toast.error).toHaveBeenCalledWith('Please retry.');
      expect(render().alerts).toEqual(['Please retry. Your draft is restored.']);
      (render().composer.onChange as (text: string) => void)('Updated draft');
      expect(render().alerts).toEqual([]);
    } else expect(render().rows[0].m.id).toBe('saved');
  });

  it('explains a connection failure and keeps the draft ready to retry', async () => {
    vi.mocked(postMessage).mockRejectedValue(new TypeError('Failed to fetch'));
    (render().composer.onChange as (text: string) => void)('Keep this draft');
    (render().send.onClick as () => void)();
    await vi.waitFor(() => expect(render().composer.value).toBe('Keep this draft'));
    expect(render().alerts).toEqual(['Could not send. Check your connection and try again. Your draft is restored.']);
    expect(render().rows).toEqual([]);
  });

  it.each([false, true])('updates a reaction immediately and reconciles its result (failure: %s)', async fail => {
    let finish!: () => void;
    let reject!: (reason: Error) => void;
    vi.mocked(toggleReaction).mockImplementation(() => new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; }));
    render(false, [savedMessage()]).rows[0].onReact('👍');
    expect(render().rows[0].m.reactions).toEqual([{ emoji: '👍', count: 2, mine: true }]);
    expect(render().rows[0].reactionPending).toBe(true);
    if (fail) reject(new Error('Offline'));
    else finish();
    await vi.waitFor(() => expect(render().rows[0].reactionPending).toBe(false));
    expect(render().rows[0].m.reactions).toEqual([{ emoji: '👍', count: fail ? 1 : 2, mine: !fail }]);
    if (fail) expect(toast.error).toHaveBeenCalledWith('Could not update the reaction.');
  });

  it('blocks duplicate reactions before the next render', async () => {
    let finish!: () => void;
    vi.mocked(toggleReaction).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const handler = render(false, [savedMessage()]).rows[0].onReact;
    handler('👍'); handler('👍');
    expect(toggleReaction).toHaveBeenCalledTimes(1);
    expect(render().rows[0].m.reactions[0].count).toBe(2);
    finish();
    await vi.waitFor(() => expect(render().rows[0].reactionPending).toBe(false));
  });

  it('confirms deletion, removes immediately, and restores on failure', async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(deleteMessage).mockImplementation(() => new Promise<void>((_, fail) => { reject = fail; }));
    await render(false, [savedMessage()]).rows[0].onDelete();
    expect(confirmDialog).toHaveBeenCalled();
    expect(render().rows).toEqual([]);
    reject(new Error('Offline'));
    await vi.waitFor(() => expect(render().rows[0].m.id).toBe('saved'));
    expect(toast.error).toHaveBeenCalledWith('Could not delete the message.');
  });
});
