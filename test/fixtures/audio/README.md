These are synthetic 440 Hz, mono, 48 kHz tones generated for the voice
finalization tests. They contain no speech or user data. Tests do not need
FFmpeg installed.

`voice-without-duration.webm` was encoded as Opus at 32 kbps with FFmpeg's
`-f webm -live 1`, omitting the duration header to reproduce MediaRecorder
output. `voice-aac.m4a` was encoded as AAC at 48 kbps. Both tones last 0.35
seconds; codec preroll can slightly change their reported container duration.
