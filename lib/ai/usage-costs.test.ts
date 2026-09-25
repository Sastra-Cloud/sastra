import { describe, expect, it } from "vitest";

import {
  estimateAudioMinutes,
  estimateR2StandardMonthlyCost,
  estimateVoiceCostUsd,
  estimateVoiceNeurons,
} from "./usage-costs";

describe("Cloudflare voice estimates", () => {
  it("uses recorded duration when present", () => {
    expect(estimateAudioMinutes({ durationMs: 90_000, sizeBytes: 1 })).toBe(1.5);
    expect(estimateVoiceCostUsd(2)).toBe(0.001);
    expect(estimateVoiceNeurons(2)).toBeCloseTo(93.26);
  });

  it("falls back to an assumed bitrate when duration is missing", () => {
    expect(estimateAudioMinutes({ sizeBytes: 180_000 })).toBeCloseTo(1);
  });
});

describe("R2 standard monthly estimate", () => {
  it("stays free within standard monthly included usage", () => {
    const estimate = estimateR2StandardMonthlyCost({
      storageGbMonth: 9.8,
      classAOperations: 999_999,
      classBOperations: 9_999_999,
    });
    expect(estimate.totalCostUsd).toBe(0);
  });

  it("rounds usage to billing units after the free tier", () => {
    const estimate = estimateR2StandardMonthlyCost({
      storageGbMonth: 10.1,
      classAOperations: 1_000_001,
      classBOperations: 10_000_001,
    });
    expect(estimate.billableGbMonth).toBe(1);
    expect(estimate.billableClassA).toBe(1_000_000);
    expect(estimate.billableClassB).toBe(1_000_000);
    expect(estimate.totalCostUsd).toBeCloseTo(4.875);
  });
});
