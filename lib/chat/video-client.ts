import {
  CHAT_VIDEO_INPUT_BYTES, originalChatVideo,
  type ChatVideoQuality, type ChatVideoProgress, type ChatVideoResult, type ChatVideoWorkerResponse,
} from "./video";

/** Starts only on Send. Terminating the worker releases encoders and buffered output on cancel/unmount. */
export function prepareChatVideo(file: File, quality: ChatVideoQuality, signal: AbortSignal, onProgress: (value: ChatVideoProgress) => void): Promise<ChatVideoResult> {
  if (signal.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  if (quality === "original") {
    const original = originalChatVideo(file);
    return original ? Promise.resolve({ file: original })
      : Promise.reject(new Error("Original videos must be MP4 or MOV files under 50 MB. Choose Standard or share a link."));
  }
  if (file.size <= 0 || file.size > CHAT_VIDEO_INPUT_BYTES) {
    return Promise.reject(new Error("Choose a video under 500 MB, shorten it, or share a link."));
  }
  return new Promise((resolve, reject) => {
    let worker: Worker;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (result?: ChatVideoResult, error?: Error) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      worker?.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(undefined, new DOMException("Cancelled", "AbortError"));
    const stalled = () => finish(undefined, new Error("Video preparation stopped. Keep this tab open and try again, or choose Original under 50 MB."));
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(stalled, 90_000);
    };
    try {
      worker = new Worker(new URL("./video-preparation.worker.ts", import.meta.url), { type: "module" });
      signal.addEventListener("abort", cancel, { once: true });
      worker.onmessage = ({ data }: MessageEvent<ChatVideoWorkerResponse>) => {
        if (data.type === "progress") {
          resetTimeout();
          onProgress(data.value);
        } else if (data.type === "done") finish(data.result);
        else finish(undefined, new Error(data.error));
      };
      worker.onerror = event => {
        event.preventDefault();
        finish(undefined, new Error("This browser cannot prepare this video. Choose Original under 50 MB, or share a link."));
      };
      worker.onmessageerror = () => stalled();
      resetTimeout();
      worker.postMessage({ file, quality });
    } catch {
      finish(undefined, new Error("This browser cannot prepare this video. Choose Original under 50 MB, or share a link."));
    }
  });
}
