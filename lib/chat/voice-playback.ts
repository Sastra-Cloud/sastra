/** Resolve MediaRecorder WebM duration without fetching or decoding a second copy. */
export function recoverVoiceDuration(audio: HTMLAudioElement) {
  let probing = false;

  function readMetadata() {
    // Chrome records WebM without a duration header. Seeking past the end makes
    // the media element read the final timestamp, then durationchange rewinds it
    // before playback begins. Finite-duration files and resumed playback stay put.
    if (audio.duration !== Infinity || audio.currentTime !== 0 || probing) return;
    probing = true;
    audio.currentTime = Number.MAX_SAFE_INTEGER;
  }

  function restoreStart() {
    if (!probing || !Number.isFinite(audio.duration)) return;
    probing = false;
    audio.currentTime = 0;
  }

  audio.addEventListener("loadedmetadata", readMetadata);
  audio.addEventListener("durationchange", restoreStart);
  // Metadata may have loaded before React attached the effect.
  readMetadata();

  return () => {
    audio.removeEventListener("loadedmetadata", readMetadata);
    audio.removeEventListener("durationchange", restoreStart);
    // React can reconnect an effect while a seek is still pending. Do not leave
    // the element parked at the probe position for the next effect to inherit.
    if (probing) audio.currentTime = 0;
  };
}
