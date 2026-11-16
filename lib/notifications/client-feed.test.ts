import { afterEach, expect, it, vi } from "vitest";
import { createNotificationFeed } from "./client-feed";

const item = { id: "alert", title: "Review needed", body: "Private details" };
afterEach(() => vi.unstubAllGlobals());

it("coalesces count reads and supersedes them when the person requests details", async () => {
  let finishCount!: (response: Response) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishCount = resolve; }))
    .mockImplementationOnce(async () => Response.json({ unread: 1, items: [item] }));
  vi.stubGlobal("fetch", fetch);
  const receive = vi.fn();
  const feed = createNotificationFeed(receive);
  const first = feed.load(false);
  const duplicate = feed.load(false);
  expect(duplicate).toBe(first);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe("/api/notifications/recent?summary=1");
  await feed.load(true);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(fetch.mock.calls[1][0]).toBe("/api/notifications/recent");
  finishCount(Response.json({ unread: 9 }));
  await first;
  expect(receive).toHaveBeenCalledExactlyOnceWith({ unread: 1, items: [item] });
});

it("protects optimistic read state until every write settles, then reads canonical counts", async () => {
  let finishOld!: (response: Response) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(async () => Response.json({ unread: 0, items: [item] }));
  vi.stubGlobal("fetch", fetch);
  const receive = vi.fn();
  const feed = createNotificationFeed(receive);
  const old = feed.load(true);
  const firstWriteSettled = feed.pause();
  const secondWriteSettled = feed.pause();
  finishOld(Response.json({ unread: 5, items: [item] }));
  await old;
  expect(receive).not.toHaveBeenCalled();
  firstWriteSettled(); firstWriteSettled();
  await feed.load(false);
  expect(fetch).toHaveBeenCalledOnce();
  secondWriteSettled();
  await feed.load(false);
  expect(receive).toHaveBeenCalledExactlyOnceWith({ unread: 0 });
});

it("shows detail-read failure and recovers on retry without replacing the last good data", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockImplementationOnce(async () => Response.json({ unread: 1, items: [item] }));
  vi.stubGlobal("fetch", fetch);
  const receive = vi.fn(), status = vi.fn();
  const feed = createNotificationFeed(receive, status);
  await feed.load(true);
  expect(receive).not.toHaveBeenCalled();
  expect(status).toHaveBeenLastCalledWith("error");
  await feed.load(true, true);
  expect(receive).toHaveBeenCalledWith({ unread: 1, items: [item] });
  expect(status).toHaveBeenLastCalledWith("idle");
});

it("ignores late responses and post-write refreshes after its signed-in surface unmounts", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetch);
  const receive = vi.fn();
  const feed = createNotificationFeed(receive);
  const read = feed.load(true);
  const settled = feed.pause();
  feed.stop();
  finish(Response.json({ unread: 1, items: [item] }));
  await read;
  settled();
  await feed.load(false);
  expect(receive).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledOnce();
});
