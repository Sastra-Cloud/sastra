import { expect, it, vi } from "vitest";
const { states } = vi.hoisted(() => ({ states: [] as unknown[] }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const value = typeof initial === "function" ? initial() : initial; states.push(value); return [value, vi.fn()]; },
  useRef: (current: unknown) => ({ current }), useTransition: () => [false, vi.fn()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/agreements/funding-actions", () => ({ approveFundingReview: vi.fn() }));
import { FundingReview } from "./funding-review";
import { normalizeExtraction } from "@/lib/imports/schema";
import type { FundingReviewInput } from "@/lib/agreements/funding-actions";
for (const [signedDate, dueDate, expected] of [
  ["2026-08-08", null, "2026-09-08"],
  ["2026-10-08", null, "2026-10-08"],
  [null, null, null],
  ["2026-08-08", "2026-08-15", "2026-08-15"],
] as const) {
  it(`defaults signing date ${signedDate} with source date ${dueDate} to ${expected}`, () => {
    states.length = 0;
    FundingReview({ importId: "review", today: "2026-09-08", projects: [], owners: [], extraction: normalizeExtraction({
      signedDate, projects: [{ title: "Articles" }], mouPaymentSchedule: [
        { trigger: "on_signing", amount: 6094.69, dueDate },
        { trigger: "on_completion", amount: 6094.68 },
      ],
    }) });
    const data = states[1] as FundingReviewInput;
    expect(data.installments[0].earliestDate).toBe(expected);
    expect(data.installments[1].earliestDate).toBeNull();
    expect(data.installments.every((row) => row.paymentDueDate === null)).toBe(true);
  });
}
