import { expect, it } from "vitest";

import { recoverVoiceDuration } from "./voice-playback";

function audioElement(duration: number, currentTime = 0) {
  return Object.assign(new EventTarget(), {
    duration,
    currentTime,
    paused: false,
  }) as HTMLAudioElement;
}

// Missing WebM duration left real voice recordings at 0:00 with a disabled
// scrubber. The probe must restore the start even if Play is already pending.
it("resolves an unknown recording length and restores the start for playback", () => {
  const audio = audioElement(NaN);
  const dispose = recoverVoiceDuration(audio);
  Object.assign(audio, { duration: Infinity });
  audio.dispatchEvent(new Event("loadedmetadata"));
  expect(audio.currentTime).toBe(Number.MAX_SAFE_INTEGER);
  audio.dispatchEvent(new Event("durationchange"));
  expect(audio.currentTime).toBe(Number.MAX_SAFE_INTEGER);

  Object.assign(audio, { duration: 24.48, currentTime: 24.48 });
  audio.dispatchEvent(new Event("durationchange"));
  expect(audio.currentTime).toBe(0);

  audio.currentTime = 8;
  audio.dispatchEvent(new Event("durationchange"));
  expect(audio.currentTime).toBe(8);
  dispose();
});

it("handles cached metadata without rewinding normal playback or acting after disposal", () => {
  const audio = audioElement(Infinity);
  const dispose = recoverVoiceDuration(audio);
  expect(audio.currentTime).toBe(Number.MAX_SAFE_INTEGER);
  dispose();
  expect(audio.currentTime).toBe(0);
  Object.assign(audio, { duration: 16.32, currentTime: 4 });
  audio.dispatchEvent(new Event("durationchange"));
  expect(audio.currentTime).toBe(4);

  const disposeFinite = recoverVoiceDuration(audio);
  audio.dispatchEvent(new Event("loadedmetadata"));
  expect(audio.currentTime).toBe(4);
  disposeFinite();
});
