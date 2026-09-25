import { describe, expect, it } from "vitest";

import { CREDITS_PER_USD, creditsToUsd, usdToCredits } from "./credits";

describe("AI credits", () => {
  it("backs 1,000 credits with the plan's internal cap", () => {
    expect(creditsToUsd(1000)).toBe(1000 / CREDITS_PER_USD);
    expect(creditsToUsd(-5)).toBe(0);
  });

  it("rounds usage up so a call never costs zero credits", () => {
    expect(usdToCredits(0)).toBe(0);
    expect(usdToCredits(0.0001)).toBe(1);
    expect(usdToCredits(0.0125)).toBe(3);
  });
});
