export const VOICE_MAX_MS = 10 * 60 * 1000;
export const VOICE_MAX_BYTES = 12 * 1024 * 1024;
export const VOICE_PEAK_COUNT = 34;

export type VoiceMetadata = { durationMs: number; peaks?: number[] };
export type PreparedVoice = { file: File; metadata: VoiceMetadata };
