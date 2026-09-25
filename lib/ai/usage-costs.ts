export const DEFAULT_WORKSPACE_AI_MONTHLY_BUDGET_USD = 25;
export const DEFAULT_CLOUDFLARE_MONTHLY_BUDGET_USD = 10;

export const CLOUDFLARE_VOICE_MODEL = "@cf/openai/whisper-large-v3-turbo";
export const CLOUDFLARE_VOICE_USD_PER_AUDIO_MINUTE = 0.0005;
export const CLOUDFLARE_VOICE_NEURONS_PER_AUDIO_MINUTE = 46.63;
export const CLOUDFLARE_WORKERS_AI_FREE_NEURONS_PER_DAY = 10_000;
export const CLOUDFLARE_WORKERS_AI_USD_PER_1000_NEURONS = 0.011;

export const R2_STANDARD_FREE_GB_MONTH = 10;
export const R2_STANDARD_FREE_CLASS_A = 1_000_000;
export const R2_STANDARD_FREE_CLASS_B = 10_000_000;
export const R2_STANDARD_USD_PER_GB_MONTH = 0.015;
export const R2_STANDARD_USD_PER_MILLION_CLASS_A = 4.5;
export const R2_STANDARD_USD_PER_MILLION_CLASS_B = 0.36;

const BYTES_PER_GIB = 1024 ** 3;

export function audioMinutesFromDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return durationMs / 60_000;
}

export function estimateAudioMinutes(input: {
  durationMs?: number;
  sizeBytes?: number;
  assumedBitsPerSecond?: number;
}): number {
  const fromDuration = audioMinutesFromDurationMs(input.durationMs ?? 0);
  if (fromDuration > 0) return fromDuration;
  const sizeBytes = input.sizeBytes ?? 0;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return 0;
  const bitsPerSecond = input.assumedBitsPerSecond ?? 24_000;
  return (sizeBytes * 8) / bitsPerSecond / 60;
}

export function estimateVoiceCostUsd(audioMinutes: number): number {
  return Math.max(0, audioMinutes) * CLOUDFLARE_VOICE_USD_PER_AUDIO_MINUTE;
}

export function estimateVoiceNeurons(audioMinutes: number): number {
  return Math.max(0, audioMinutes) * CLOUDFLARE_VOICE_NEURONS_PER_AUDIO_MINUTE;
}

export function bytesToGib(bytes: number): number {
  return Math.max(0, bytes) / BYTES_PER_GIB;
}

export function roundedBillableCount(
  usage: number,
  freeIncluded: number,
  billingUnit: number
): number {
  if (!Number.isFinite(usage) || usage <= freeIncluded) return 0;
  return Math.max(0, Math.ceil(usage / billingUnit) * billingUnit - freeIncluded);
}

export function estimateR2StandardMonthlyCost(input: {
  storageGbMonth: number;
  classAOperations: number;
  classBOperations: number;
}) {
  const billableGbMonth = roundedBillableCount(
    input.storageGbMonth,
    R2_STANDARD_FREE_GB_MONTH,
    1
  );
  const billableClassA = roundedBillableCount(
    input.classAOperations,
    R2_STANDARD_FREE_CLASS_A,
    1_000_000
  );
  const billableClassB = roundedBillableCount(
    input.classBOperations,
    R2_STANDARD_FREE_CLASS_B,
    1_000_000
  );

  const storageCostUsd = billableGbMonth * R2_STANDARD_USD_PER_GB_MONTH;
  const classACostUsd =
    (billableClassA / 1_000_000) * R2_STANDARD_USD_PER_MILLION_CLASS_A;
  const classBCostUsd =
    (billableClassB / 1_000_000) * R2_STANDARD_USD_PER_MILLION_CLASS_B;

  return {
    billableGbMonth,
    billableClassA,
    billableClassB,
    storageCostUsd,
    classACostUsd,
    classBCostUsd,
    totalCostUsd: storageCostUsd + classACostUsd + classBCostUsd,
  };
}
