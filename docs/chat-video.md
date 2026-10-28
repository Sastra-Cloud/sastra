# Chat video preparation

Chat uses `mediabunny` in an on-demand module worker. The input is read with
`BlobSource`; the large original is never copied into an ArrayBuffer or sent
to a conversion provider. Clips are processed serially to limit codec and
memory pressure. The existing presign → direct PUT → complete flow and its
authorization, quota, and 50 MiB server checks remain authoritative.

## Delivery presets

Standard targets H.264 MP4, up to 1280×720 (or portrait equivalent), at most
30 fps, 2.5 Mbps variable video bitrate, and 96 kbps AAC stereo. Higher quality
raises the ceiling to 1920×1080 / 4.5 Mbps for screen text. Neither enlarges
small sources or increases an already lower frame rate. Rotation is baked in,
descriptive metadata is stripped from converted copies, and MP4 Fast Start
supports progressive playback. Copies that skip preparation retain the original
file and metadata. Packaging-only copies preserve rotation metadata.

## Avoiding unnecessary recompression

There is no reliable "already compressed" flag, and a filename or file size
alone cannot measure visual quality. Preflight compares the complete source's
bytes and duration with the selected encoding budget, after verifying codecs.
The estimated savings threshold is an application tradeoff, not a quality score.

- Compatible H.264/AAC MP4s up to 8 MiB retain the existing small-file shortcut.
- Larger compatible clips up to 50 MiB, 1080p (either orientation), and roughly
  30 fps skip a lossy encode if the predicted saving is 20% or less. This can
  preserve useful 1080p screen text even with Standard selected.
- Eligible MP4s are sent unchanged, with no decoder or encoder needed.
- Eligible MOV/MKV and other readable containers are copied into MP4 with
  `copy: { mode: "forced" }`. No resize, frame-rate, quality, or audio options
  are set on that path, so it cannot silently re-encode. Both primary tracks
  must survive. A copy that fails or exceeds the upload cap falls back to the
  ordinary validated conversion.
- Incompatible codecs (including HEVC), large/high-frame-rate pictures, and
  files above the upload limit still use the normal preparation path.

Full-file bytes/duration avoid guessing VBR bitrate from a short sample.
Mediabunny's timestamp-based frame-rate metrics identify frame rate. Neither
heuristic claims to detect previous encodes or guarantee identical perceived
quality. The existing finished-size guard remains authoritative.

These are chat delivery choices, not archival presets. The 720p bitrate sits
between LiveKit's measured H.264 webcam recommendation (1.25 Mbps) and its
high-motion recommendations (3.5 Mbps), all measured at 30 fps:
<https://livekit.com/webrtc/bitrate-guide>. Source complexity still affects
quality; Higher quality is available when text matters more than file size.

A 45 MiB target, minus muxing and audio headroom, sets a duration-based budget.
A resolution ladder reduces dimensions for longer clips rather than encoding
1080p at an unsuitable bitrate. Variable bitrate is not a hard size guarantee:
output writes are bounded and the finished file is checked against 50 MiB.
Inputs are bounded to 500 MiB, ten minutes, and 4K. Original mode retains the
existing MP4/MOV / 50 MiB limit.

## Failure and lifecycle behavior

No server message is created until all selected videos are prepared. A failed
or cancelled preparation restores text, reply context, and original File
objects. The worker is terminated on cancellation, inactivity timeout, error,
and completion; unmounting aborts pending preparation. Conversion cleanup
releases the input and codec resources. Upload progress uses XHR byte events;
final server verification stays a separate pending phase.

Codec support is probed at runtime. The small `@mediabunny/aac-encoder` WASM
extension loads only when native AAC encoding is missing. CSP permits
`wasm-unsafe-eval`, without enabling JavaScript eval in production. A discarded
primary audio or video track blocks sending; unsupported sources require an
explicit Original choice or an external link. Successfully prepared files are
cached by original File and quality for upload retries, with weak references.

Playback uses authenticated file redirects, native controls, metadata-only
preloading, and an explicit reload for expired links or playback failures.
Downloads remain available. No public object URLs, autoplay, adaptive streaming
service, server encoder, or new environment variables are required.

Mediabunny references:

- Conversion, progress, cancellation, dimensions, frame rates, track inspection:
  <https://mediabunny.dev/guide/converting-media-files>
- VBR quality settings: <https://mediabunny.dev/guide/media-sources#encoding-quality>
- Runtime codec availability: <https://mediabunny.dev/guide/supported-formats-and-codecs>
- AAC extension: <https://mediabunny.dev/guide/extensions/aac-encoder>
- Worker and codec resource guidance: <https://www.w3.org/TR/webcodecs/#best-practices-for-authors-using-webcodecs>
