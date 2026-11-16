import { afterEach, expect, it, vi } from "vitest";
import { prepareVoiceMessage } from "./voice-client";

class WorkerDouble {
  static latest: WorkerDouble;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { WorkerDouble.latest = this; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("preserves a native recording if optional preparation stalls or is unsupported", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", WorkerDouble);
  const file = new File(["recording"], "voice.webm", { type: "audio/webm" });
  const prepared = prepareVoiceMessage(file, 2400, new AbortController().signal);
  const worker = WorkerDouble.latest;
  vi.advanceTimersByTime(15_000);
  expect(await prepared).toEqual({ file, metadata: { durationMs: 2400 } });
  expect(worker.terminate).toHaveBeenCalledOnce();
  vi.stubGlobal("Worker", undefined);
  expect((await prepareVoiceMessage(file, 2400, new AbortController().signal)).file).toBe(file);
});

it("terminates preparation on cancellation and ignores a late worker result", async () => {
  vi.stubGlobal("Worker", WorkerDouble);
  const controller = new AbortController();
  const file = new File(["recording"], "voice.webm");
  const prepared = prepareVoiceMessage(file, 1000, controller.signal);
  const rejected = expect(prepared).rejects.toMatchObject({ name: "AbortError" });
  const worker = WorkerDouble.latest;
  controller.abort();
  worker.onmessage?.({ data: { result: { file, metadata: { durationMs: 1000 } } } });
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
});
