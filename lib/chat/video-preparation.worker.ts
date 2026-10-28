import { convertChatVideo } from "./video-conversion";
import type { ChatVideoWorkerRequest, ChatVideoWorkerResponse } from "./video";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ChatVideoWorkerRequest>) => void) | null;
  postMessage: (value: ChatVideoWorkerResponse) => void;
};

scope.onmessage = async ({ data }) => {
  try {
    let lastPercent = -1;
    const result = await convertChatVideo(data, value => {
      const percent = Math.floor(value.progress * 100);
      if (percent === lastPercent) return;
      lastPercent = percent;
      scope.postMessage({ type: "progress", value });
    });
    scope.postMessage({ type: "done", result });
  } catch (error) {
    // Known, actionable validation errors are safe; browser/codec internals are not UI copy.
    const message = error instanceof Error && /^(This |Choose |Resize |Shorten )/.test(error.message)
      ? error.message
      : "Could not prepare this video. Choose Original under 50 MB, try another browser, or share a link.";
    scope.postMessage({ type: "error", error: message });
  }
};
