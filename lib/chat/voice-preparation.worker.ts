import { prepareVoiceFile } from "./voice-preparation";
import type { PreparedVoice } from "./voice-metadata";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<File>) => void) | null;
  postMessage: (value: { result: PreparedVoice } | { failed: true }) => void;
};
scope.onmessage = async ({ data }) => {
  try { scope.postMessage({ result: await prepareVoiceFile(data) }); }
  catch { scope.postMessage({ failed: true }); }
};
