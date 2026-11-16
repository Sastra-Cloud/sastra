import {
  ALL_FORMATS, AudioSampleSink, BlobSource, BufferTarget, Conversion,
  Input, Mp4OutputFormat, Output, WebMOutputFormat,
} from "mediabunny";
import { VOICE_MAX_BYTES, VOICE_MAX_MS, VOICE_PEAK_COUNT, type PreparedVoice } from "./voice-metadata";

/** Worker-only: finalize headers without transcoding or decoding the whole clip into RAM. */
export async function prepareVoiceFile(file: File): Promise<PreparedVoice> {
  if (!file.size || file.size > VOICE_MAX_BYTES) throw new Error("Recording is too large.");
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  let finalized: Input | undefined;
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Recording has no audio track.");
    let duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration * 1000 > VOICE_MAX_MS + 1000) {
      throw new Error("Recording duration could not be read.");
    }

    const metadata: PreparedVoice["metadata"] = { durationMs: Math.ceil(duration * 1000) };
    let prepared = file;
    const format = track.codec === "opus" ? new WebMOutputFormat({ appendOnly: false })
      : track.codec === "aac" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : null;
    if (format) {
      const target = new BufferTarget();
      const output = new Output({ target, format });
      let conversion: Conversion | undefined;
      try {
        conversion = await Conversion.init({ input, output, tracks: "primary", copy: { mode: "forced" }, tags: {}, showWarnings: false });
        if (conversion.isValid && conversion.discardedTracks.length === 0) {
          await conversion.execute();
          if (target.buffer?.byteLength && target.buffer.byteLength <= VOICE_MAX_BYTES) {
            const extension = track.codec === "opus" ? "webm" : "m4a";
            prepared = new File([target.buffer], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, {
              type: track.codec === "opus" ? "audio/webm;codecs=opus" : "audio/mp4", lastModified: file.lastModified,
            });
          }
        }
      } finally { await conversion?.cancel(); }
    }

    // Copying can normalize codec preroll timestamps. Store the delivered
    // container's actual duration and sample its own timeline.
    let waveformTrack = track;
    if (prepared !== file) {
      finalized = new Input({ source: new BlobSource(prepared), formats: ALL_FORMATS });
      duration = await finalized.computeDuration();
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid finalized duration.");
      metadata.durationMs = Math.ceil(duration * 1000);
      waveformTrack = (await finalized.getPrimaryAudioTrack())!;
    }

    // Optional on older Safari. Waveform processing never blocks a valid recording
    // on browsers without an audio decoder, and holds only one decoded sample.
    if (typeof AudioDecoder !== "undefined" && await waveformTrack.canDecode().catch(() => false)) {
      try {
        const sums = new Float64Array(VOICE_PEAK_COUNT);
        const counts = new Uint32Array(VOICE_PEAK_COUNT);
        for await (const sample of new AudioSampleSink(waveformTrack).samples()) {
          try {
            const values = new Float32Array(sample.numberOfFrames);
            for (let channel = 0; channel < sample.numberOfChannels; channel++) {
              sample.copyTo(values, { planeIndex: channel, format: "f32-planar" });
              for (let i = 0; i < values.length; i += 16) {
                const bin = Math.max(0, Math.min(VOICE_PEAK_COUNT - 1,
                  Math.floor((sample.timestamp + i / sample.sampleRate) / duration * VOICE_PEAK_COUNT)));
                sums[bin] += values[i] * values[i];
                counts[bin]++;
              }
            }
          } finally { sample.close(); }
        }
        const rms = Array.from(sums, (sum, i) => Math.sqrt(sum / Math.max(1, counts[i])));
        const max = Math.max(...rms, 0.001);
        metadata.peaks = rms.map(value => Math.round(Math.min(1, value / max) * 1000) / 1000);
      } catch { /* The finalized file and duration remain usable without peaks. */ }
    }
    return { file: prepared, metadata };
  } finally { finalized?.dispose(); input.dispose(); }
}
