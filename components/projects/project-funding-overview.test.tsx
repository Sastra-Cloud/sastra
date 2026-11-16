import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { buildProjectFundingOverview } from "@/lib/projects/funding-overview";
import { ProjectFundingOverview } from "./project-funding-overview";

it("keeps calculated promises distinct from cash and links each funding screen to the relevant review tab", () => {
  const funding = buildProjectFundingOverview({
    currency: "USD", costs: [], agreements: [], allocations: [], donationReceiptIds: [],
    payments: [{ id: "final", amount: "0", currency: "USD", receiptId: null, paidAt: null,
      trigger: "on_completion", dueDate: null, publicDescription: null,
      notes: "Remaining 50% of the Total Payment to Licensee (US$10,000.00)" }],
    receipts: [{ id: "receipt", amount: "1000", currency: "USD", actualNetAmount: null,
      expectedNetAmount: null, source: "Funding partner", receivedDate: null }],
  });
  for (const view of ["full", "summary", "agreement"] as const) {
    const html = renderToStaticMarkup(<ProjectFundingOverview funding={funding} slug="book" view={view} />);
    expect(html).toContain("Needs review");
    expect(html).toContain("$5,000.00");
    expect(html).toContain("$1,000.00");
    expect(html).toContain('/projects/book/budget?run=main#agreements-fees');
    expect(html).toContain('/projects/book/budget?run=main#cash-reconciliation');
    if (view !== "summary") {
      expect(html).toContain("Confirm this amount before invoicing");
      expect(html).toContain('/projects/book/budget?run=main#mou-payment-final');
    }
  }
});

it("does not relabel a quotation total as a different funding currency", () => {
  const funding = buildProjectFundingOverview({ currency: "USD", payments: [], receipts: [], agreements: [], allocations: [], donationReceiptIds: [],
    costs: [{ amount: "50", amountSecured: "0", amountSpent: "0", currency: "EUR" }],
  });
  const html = renderToStaticMarkup(<ProjectFundingOverview funding={funding} slug="book" view="summary" quotation={{ totalCents: 100000, currency: "USD" }} />);
  expect(html).not.toContain("Partner quotation");
  expect(html).toContain("Estimated costs");
});
