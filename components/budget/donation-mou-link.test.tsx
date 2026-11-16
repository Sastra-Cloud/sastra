// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/donations/actions", () => ({ confirmDonationMouPaymentMatch: vi.fn() }));
import { DonationMouLink } from "./donation-mou-link";
import { confirmDonationMouPaymentMatch } from "@/lib/donations/actions";

it("uses newly saved amounts when opening receipt review, and does not keep an automatic choice when it becomes ambiguous", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const first = { paymentId: "signing", amount: "10835.28", currency: "USD", label: "On signing" };
  const other = { ...first, paymentId: "other", amount: "3000.00" };
  const props = { allocationId: "allocation", receiptAmount: "10835.28", currency: "USD", onLinked: vi.fn() };
  const click = (label: string) => [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === label)!.click();
  try {
    await act(() => root.render(<DonationMouLink {...props} options={[other]} />));
    await act(() => root.render(<DonationMouLink {...props} options={[other, first]} />));
    await act(() => click("Link to expected payment"));
    expect(container.querySelector("select")?.value).toBe("signing");
    await act(() => click("Cancel"));
    await act(() => root.render(<DonationMouLink {...props} options={[first, { ...first, paymentId: "final", label: "On completion" }]} />));
    await act(() => click("Link to expected payment"));
    expect(container.querySelector("select")?.value).toBe("");
    expect([...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "Confirm as received")?.disabled).toBe(true);
  } finally { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});

it("links an expected payment that has no amount yet, after saying what will be saved", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(confirmDonationMouPaymentMatch).mockResolvedValue({});
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const unset = { paymentId: "signing", amount: "0.00", currency: "USD", label: "On signing", amountUnset: true };
  const button = (label: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === label)!;
  try {
    await act(() => root.render(<DonationMouLink allocationId="allocation" receiptAmount="10835.28" currency="USD" onLinked={vi.fn()} options={[unset]} />));
    await act(() => button("Link to expected payment").click());
    const select = container.querySelector("select")!;
    // An empty payment is never chosen for the reviewer.
    expect(select.value).toBe("");
    expect(select.textContent).toContain("no amount yet");
    await act(() => { select.value = "signing"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(container.textContent).toContain("Linking saves $10,835.28 as its amount");
    expect(container.querySelector("textarea")).toBeNull();
    await act(async () => { button("Confirm as received").click(); });
    expect(confirmDonationMouPaymentMatch).toHaveBeenCalledWith(expect.objectContaining({ paymentId: "signing", expectedPaymentAmount: 0, expectedReceiptAmount: 10835.28, setPaymentAmountFromReceipt: true }));
  } finally { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
