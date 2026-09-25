import { describe, expect, it } from "vitest";

import { aiAmountLabel, formatAiAmount, formatAiAmountShort } from "./amount-format";

describe("formatAiAmount", () => {
  it("shows dollars to self-hosted admins", () => {
    expect(formatAiAmount(1.234, "usd")).toBe("$1.23");
    expect(formatAiAmount(0.004, "usd", { compact: true })).toBe("<$0.01");
    expect(formatAiAmount(0, "usd", { compact: true })).toBe("$0.00");
  });

  it("shows only credits on Sastra Cloud, rounded up per amount", () => {
    expect(formatAiAmount(5, "credits")).toBe("1,000 credits");
    expect(formatAiAmount(0.004, "credits")).toBe("1 credit");
    expect(formatAiAmount(0, "credits")).toBe("0 credits");
    expect(formatAiAmount(Number.NaN, "credits")).toBe("0 credits");
  });

  it("never prints a dollar sign in credit mode", () => {
    for (const usd of [0, 0.001, 0.37, 5, 12.5]) {
      expect(formatAiAmount(usd, "credits")).not.toContain("$");
      expect(formatAiAmountShort(usd, "credits")).not.toContain("$");
    }
    expect(formatAiAmountShort(2.5, "usd")).toBe("$2.50");
    expect(aiAmountLabel("credits")).toBe("Credits");
    expect(aiAmountLabel("usd")).toBe("Spend");
  });
});
