import { afterEach, expect, it, vi } from "vitest";
import { VoicePlayer } from "./voice-player";

class AudioDouble extends EventTarget {
  src = "";
  paused = true;
  currentTime = 0;
  duration = NaN;
  preload = "";
  error: { code: number } | null = null;
  setAttribute = vi.fn();
  removeAttribute = vi.fn();
  load = vi.fn(() => { this.error = null; this.currentTime = 0; this.duration = NaN; });
  play = vi.fn((): Promise<void> => { this.paused = false; return Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event("pause")); });
  playing() { this.paused = false; this.dispatchEvent(new Event("playing")); }
  metadata(duration: number) { this.duration = duration; this.dispatchEvent(new Event("loadedmetadata")); }
}
function setup() {
  const audio = new AudioDouble();
  const create = vi.fn(() => audio as unknown as HTMLAudioElement);
  const player = new VoicePlayer(create, () => Date.now());
  return { audio, player, create };
}
const first = { id: "first", src: "/api/files/first/download?inline=1", durationMs: 24_000 };
const second = { id: "second", src: "/api/files/second/download?inline=1", durationMs: 16_000 };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("makes no media element or request until Play, then shares one element across messages", () => {
  const { audio, player, create } = setup();
  const unsubscribe = player.subscribe(() => {});
  for (let i = 0; i < 100; i++) player.snapshot(String(i));
  expect(create).not.toHaveBeenCalled();
  player.play(first);
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(player.snapshot(first.id).status).toBe("loading");
  audio.metadata(24); audio.playing();
  audio.currentTime = 5; audio.dispatchEvent(new Event("timeupdate"));
  player.play(second);
  expect(create).toHaveBeenCalledTimes(1);
  expect(player.snapshot(first.id)).toMatchObject({ status: "idle", currentTime: 5 });
  expect(player.snapshot(second.id).status).toBe("loading");
  unsubscribe(); player.dispose();
});

it("ignores a cancelled old Play promise after switching to another message", async () => {
  const { audio, player } = setup();
  let rejectOld!: (error: Error) => void;
  audio.play.mockImplementationOnce(() => new Promise((_, reject) => { audio.paused = false; rejectOld = reject; }));
  player.play(first);
  player.play(second);
  audio.metadata(16); audio.playing();
  rejectOld(new DOMException("Interrupted", "AbortError"));
  await Promise.resolve();
  expect(player.snapshot(second.id)).toMatchObject({ status: "playing", error: null });
  expect(player.snapshot(first.id).error).toBeNull();
  player.dispose();
});

it("lets the user cancel loading and retry a denied Play without disabling the message", async () => {
  const { audio, player } = setup();
  audio.play.mockRejectedValueOnce(new DOMException("Not allowed", "NotAllowedError"));
  player.play(first);
  await Promise.resolve();
  expect(player.snapshot(first.id)).toMatchObject({ status: "error", error: expect.stringContaining("Press Play") });
  const previousUrl = audio.src;
  player.play(first);
  expect(audio.src).not.toBe(previousUrl);
  expect(player.snapshot(first.id).status).toBe("loading");
  player.play(first);
  expect(player.snapshot(first.id)).toMatchObject({ status: "paused", error: null });
  player.dispose();
});

it("refreshes access after idle and restores position when metadata arrives", () => {
  vi.useFakeTimers();
  const { audio, player } = setup();
  player.play(first); audio.metadata(24); audio.playing();
  audio.currentTime = 7; audio.dispatchEvent(new Event("timeupdate"));
  player.pause();
  const previousUrl = audio.src;
  vi.advanceTimersByTime(5 * 60 * 1000);
  player.play(first);
  expect(audio.src).not.toBe(previousUrl);
  audio.metadata(24);
  expect(audio.currentTime).toBe(7);
  audio.playing();
  expect(player.snapshot(first.id).status).toBe("playing");
  player.dispose();
});

it("recovers from network failure or a stalled load through an explicit retry", () => {
  vi.useFakeTimers();
  const { audio, player } = setup();
  player.play(first);
  audio.error = { code: 2 }; audio.dispatchEvent(new Event("error"));
  expect(player.snapshot(first.id).status).toBe("error");
  player.play(first);
  expect(audio.error).toBeNull();
  vi.advanceTimersByTime(15_000);
  expect(player.snapshot(first.id)).toMatchObject({ status: "error", error: expect.stringContaining("too long") });
  player.play(first); audio.metadata(24); audio.playing();
  expect(player.snapshot(first.id)).toMatchObject({ status: "playing", error: null });
  player.dispose();
});

it("releases media on teardown and can reconnect without retaining a signed-in user's audio", () => {
  const { audio, player, create } = setup();
  player.play(first); audio.metadata(24); audio.playing();
  player.dispose();
  expect(audio.removeAttribute).toHaveBeenCalledWith("src");
  expect(player.snapshot(first.id).status).toBe("idle");
  player.play(first);
  expect(create).toHaveBeenCalledTimes(1);
  const disconnect = player.connect();
  player.play(first);
  expect(create).toHaveBeenCalledTimes(2);
  expect(audio.src).toContain("first/download");
  disconnect();
});

it("reloads a silently playing element at its saved position and reconciles OS pauses on return", () => {
  const { audio, player } = setup();
  player.play(first); audio.metadata(24); audio.playing();
  audio.currentTime = 6; audio.dispatchEvent(new Event("timeupdate"));
  const previousUrl = audio.src;
  player.play(first, true);
  expect(audio.src).not.toBe(previousUrl);
  audio.metadata(24); audio.playing();
  expect(audio.currentTime).toBe(6);
  audio.paused = true; // An OS interruption without a page pause event.
  player.reconcile();
  expect(player.snapshot(first.id)).toMatchObject({ status: "paused", error: null, currentTime: 6 });
  player.dispose();
});

it("keeps the resume position if a reload is cancelled before its metadata arrives", () => {
  const { audio, player } = setup();
  player.play(first); audio.metadata(24); audio.playing();
  audio.currentTime = 6; audio.dispatchEvent(new Event("timeupdate"));
  player.play(first, true);
  player.pause();
  audio.dispatchEvent(new Event("timeupdate")); // Native load() reset the empty element to zero.
  expect(player.snapshot(first.id).currentTime).toBe(6);
  player.seek(first.id, 9);
  player.play(first); audio.metadata(24); audio.playing();
  expect(audio.currentTime).toBe(9);
  player.dispose();
});
