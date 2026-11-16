import { expect, it } from "vitest";

import { buildBudgetSteps, type BudgetStepsInput } from "./steps";

const base: BudgetStepsInput = {
  currency: "USD",
  printing: "expected",
  wordCount: 0,
  sourcePageCount: 0,
  items: [],
  hasPartnerQuote: true,
  partnerQuoteCents: 0,
  coverageCents: 0,
  approval: { required: false, status: null, canSend: true },
  unsentQuotationCount: 0,
  sentProposalCount: 0,
  waitingCount: 0,
  oldestWaitingDays: 0,
  agreedWithoutPaymentsCount: 0,
  hasFunding: false,
};
const line = (
  category: string,
  amount: string,
  unit = "flat",
  isAutoQuantity = false
) => ({ category, unit, amount, isAutoQuantity });
const status = (guide: ReturnType<typeof buildBudgetSteps>) =>
  Object.fromEntries(guide.steps.map((step) => [step.key, step.status]));

it("starts an empty budget at guided setup", () => {
  const guide = buildBudgetSteps(base);
  expect(guide.next?.key).toBe("costs");
  expect(guide.next?.action).toEqual({ label: "Start guided setup", href: "#budget-setup" });
  expect(guide.steps.some((step) => step.key === "book-size")).toBe(false);
  expect(guide.doneCount).toBe(0);
});

it("asks for the book size only when a cost is calculated from it", () => {
  const typed = buildBudgetSteps({
    ...base,
    items: [line("translation", "2000.00", "words")],
  });
  expect(typed.steps.some((step) => step.key === "book-size")).toBe(false);

  const automatic = buildBudgetSteps({
    ...base,
    items: [line("translation", "0.00", "words", true), line("cover_design", "300.00")],
  });
  expect(automatic.next?.key).toBe("book-size");
  expect(automatic.steps.find((step) => step.key === "costs")?.fact).toContain("1 cost has no amount");
});

it("points a costed book budget at the printing estimate, then the partner quote", () => {
  const costed = {
    ...base,
    wordCount: 40_000,
    items: [line("translation", "2000.00", "words", true)],
    partnerQuoteCents: 200_000,
    coverageCents: -26_000,
  };
  const noPrinting = buildBudgetSteps(costed);
  expect(noPrinting.next?.key).toBe("printing");
  expect(noPrinting.next?.action?.href).toBe("#print-budget-estimate");

  const withPrinting = buildBudgetSteps({
    ...costed,
    items: [...costed.items, line("print_ship", "3000.00")],
  });
  expect(withPrinting.next?.key).toBe("partner-quote");
  expect(withPrinting.next?.fact).toContain("$260 less");
});

it("does not block other kinds of project on printing", () => {
  const guide = buildBudgetSteps({
    ...base,
    printing: "optional",
    wordCount: 1000,
    items: [line("translation", "50.00", "words", true)],
    partnerQuoteCents: 6000,
  });
  expect(status(guide).printing).toBe("later");
  expect(guide.next?.key).toBe("proposal");
  expect(guide.total).toBe(5);
  expect(buildBudgetSteps({ ...base, printing: "none" }).steps.some((s) => s.key === "printing")).toBe(false);
});

it("names approval as the reason a proposal cannot be sent yet", () => {
  const ready = {
    ...base,
    printing: "none" as const,
    wordCount: 1000,
    items: [line("translation", "50.00", "words", true)],
  };
  const waiting = buildBudgetSteps({
    ...ready,
    approval: { required: true, status: "pending", canSend: false },
  });
  expect(waiting.next?.key).toBe("proposal");
  expect(waiting.next?.action).toEqual({ label: "Open approvals", href: "#decisions" });

  const saved = buildBudgetSteps({ ...ready, unsentQuotationCount: 1 });
  expect(saved.next?.fact).toContain("1 partner quotation is ready");
});

it("follows a sent proposal to the partner’s answer and the money", () => {
  const sent = {
    ...base,
    printing: "none" as const,
    wordCount: 1000,
    items: [line("translation", "50.00", "words", true)],
    sentProposalCount: 1,
  };
  const waiting = buildBudgetSteps({ ...sent, waitingCount: 1, oldestWaitingDays: 12 });
  expect(waiting.next?.key).toBe("answer");
  expect(waiting.next?.fact).toBe("1 proposal is waiting for an answer (12 days).");
  expect(waiting.next?.action).toEqual({ label: "Record answer", href: "#funding-path" });

  const agreed = buildBudgetSteps({ ...sent, agreedWithoutPaymentsCount: 1 });
  expect(agreed.next?.fact).toContain("Add the expected payments");

  expect(buildBudgetSteps(sent).allDone).toBe(true);
});

it("treats an imported project with recorded funding as past the proposal", () => {
  const guide = buildBudgetSteps({
    ...base,
    printing: "none",
    items: [line("custom", "5000.00")],
    hasFunding: true,
  });
  expect(status(guide).proposal).toBe("done");
  expect(guide.allDone).toBe(true);
});

it("does not call a printing cost that waits for a printer’s price a missing amount", () => {
  const guide = buildBudgetSteps({
    ...base,
    wordCount: 1000,
    items: [line("translation", "50.00", "words", true), line("print_ship", "0.00")],
    printHref: "/projects/book/print",
  });
  expect(status(guide).costs).toBe("done");
  expect(guide.next?.key).toBe("printing");
  expect(guide.next?.action).toEqual({ label: "Open Print", href: "/projects/book/print" });

  const onlyPrinting = buildBudgetSteps({ ...base, items: [line("print_ship", "3000.00")] });
  expect(onlyPrinting.next?.key).toBe("costs");
  expect(onlyPrinting.next?.action?.href).toBe("#budget-setup");
});
