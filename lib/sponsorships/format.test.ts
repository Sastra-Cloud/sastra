import { expect, it } from "vitest";
import { sponsorshipMoney } from "./format";
it("shows the stored two-decimal ledger amount even for zero-decimal currency defaults", () => {
  expect(sponsorshipMoney("2.50", "JPY")).toMatch(/2\.50$/);
  expect(sponsorshipMoney("2.50", "USD")).toMatch(/2\.50$/);
});
