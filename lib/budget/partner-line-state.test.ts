import { expect, it } from "vitest";
import { optimisticVisibleState, settleOptimisticEntry, type OptimisticMachine } from "@/lib/actions/optimistic-machine";
import { partnerQuoteTotalCents } from "./compute";
import { applyPartnerLinePatch, applyPartnerRates, type PartnerLinePatch, type PartnerQuoteLine } from "./partner-line-state";

it("updates partner totals immediately and rolls back only the failed line across a server refresh", () => {
  const items: PartnerQuoteLine[] = [
    { id: "audio", label: "Audiobook", partnerLabel: null, partnerUnitPrice: "0.01", partnerVisible: true, unit: "words", quantity: "59000", unitPrice: "0.008", amount: "472" },
    { id: "print", label: "Printing", partnerLabel: null, partnerUnitPrice: null, partnerVisible: true, unit: "flat", quantity: "1", unitPrice: "2000", amount: "2000" },
  ];
  const machine: OptimisticMachine<PartnerQuoteLine[], PartnerLinePatch> = {
    source: items,
    confirmed: items,
    entries: [
      { id: 1, key: "audio", status: "pending", input: { id: "audio", patch: { partnerVisible: false } } },
      { id: 2, key: "print", status: "pending", input: { id: "print", patch: { partnerVisible: false } } },
    ],
  };
  expect(partnerQuoteTotalCents(optimisticVisibleState(machine, applyPartnerLinePatch))).toBe(0);
  const saved = settleOptimisticEntry(machine, 2, "succeeded", undefined, applyPartnerLinePatch);
  const refreshed = applyPartnerLinePatch(items, { id: "print", patch: { partnerVisible: false } });
  const rebased = { ...saved, source: refreshed, confirmed: refreshed };
  expect(partnerQuoteTotalCents(optimisticVisibleState(rebased, applyPartnerLinePatch))).toBe(0);
  const failed = settleOptimisticEntry(rebased, 1, "failed", undefined, applyPartnerLinePatch);
  const settled = optimisticVisibleState(failed, applyPartnerLinePatch);
  expect(settled.map((item) => item.partnerVisible)).toEqual([true, false]);
  expect(partnerQuoteTotalCents(settled)).toBe(59000);
  expect(settled[0].amount).toBe("472");
});

it("restores inherited rates and financial totals immediately, then rolls back a failed bulk undo", () => {
  const items: PartnerQuoteLine[] = [
    { id: "audio", label: "Audiobook", partnerLabel: "Audio production", partnerUnitPrice: "0.02", partnerVisible: true, unit: "words", quantity: "59000", unitPrice: "0.01", amount: "590" },
    { id: "print", label: "Printing", partnerLabel: null, partnerUnitPrice: "2300", partnerVisible: true, unit: "flat", quantity: "1", unitPrice: "2000", amount: "2000" },
  ];
  const machine: OptimisticMachine<PartnerQuoteLine[], Record<string, string | null>> = {
    source: items, confirmed: items,
    entries: [{ id: 1, key: "partner-rates", status: "pending", input: { audio: null, print: "1500" } }],
  };
  const immediate = optimisticVisibleState(machine, applyPartnerRates);
  expect(partnerQuoteTotalCents(immediate)).toBe(209000);
  expect(immediate[0]).toMatchObject({ partnerUnitPrice: null, amount: "590", partnerLabel: "Audio production" });
  const failed = settleOptimisticEntry(machine, 1, "failed", undefined, applyPartnerRates);
  expect(optimisticVisibleState(failed, applyPartnerRates)).toEqual(items);
  const saved = settleOptimisticEntry(machine, 1, "succeeded", undefined, applyPartnerRates);
  expect(optimisticVisibleState(saved, applyPartnerRates)).toEqual(immediate);
});
