import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";
import { prepareVoiceFile } from "./voice-preparation";

async function inspect(file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("Missing audio track");
    const packets = [];
    for await (const packet of new EncodedPacketSink(track).packets()) packets.push(Buffer.from(packet.data));
    return { duration: await input.computeDuration(), codec: track.codec, packets };
  } finally { input.dispose(); }
}

// These small synthetic tones are checked in; FFmpeg is not a test dependency.
// Repackaging must preserve every encoded audio packet, including the last one.
it.each([
  ["voice-without-duration.webm", "audio/webm;codecs=opus"],
  ["voice-aac.m4a", "audio/mp4"],
])("finalizes %s without losing or transcoding its audio", async (name, type) => {
  const bytes = await readFile(new URL(`../../test/fixtures/audio/${name}`, import.meta.url));
  const file = new File([bytes], name, { type });
  const before = await inspect(file);
  const result = await prepareVoiceFile(file);
  const after = await inspect(result.file);
  expect(result.file).not.toBe(file);
  expect(after.codec).toBe(before.codec);
  expect(after.packets).toEqual(before.packets);
  // Packet copy may normalize the codec's short leading preroll.
  expect(Math.abs(after.duration - before.duration)).toBeLessThan(0.03);
  expect(result.metadata.durationMs / 1000).toBeCloseTo(after.duration, 2);
  if (type.startsWith("audio/webm")) {
    // EBML's Duration element must now exist, unlike the MediaRecorder-style input.
    expect(Buffer.from(await result.file.arrayBuffer()).includes(Buffer.from([0x44, 0x89]))).toBe(true);
  }
});
