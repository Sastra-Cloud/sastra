import type { PreparedVoice } from "./voice-metadata";

/** Preparation is optional: preserve native recordings on older browsers or worker failure. */
export function prepareVoiceMessage(file: File, durationMs: number, signal: AbortSignal): Promise<PreparedVoice> {
  if (signal.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const original = { file, metadata: { durationMs } };
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (result = original, aborted = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      worker?.terminate();
      if (aborted) reject(new DOMException("Cancelled", "AbortError"));
      else resolve(result);
    };
    const cancel = () => finish(original, true);
    try {
      worker = new Worker(new URL("./voice-preparation.worker.ts", import.meta.url), { type: "module" });
      signal.addEventListener("abort", cancel, { once: true });
      worker.onmessage = ({ data }: MessageEvent<{ result?: PreparedVoice }>) => finish(data.result);
      worker.onerror = event => { event.preventDefault(); finish(); };
      worker.onmessageerror = () => finish();
      timeout = setTimeout(() => finish(), 15_000);
      worker.postMessage(file);
    } catch { finish(); }
  });
}
