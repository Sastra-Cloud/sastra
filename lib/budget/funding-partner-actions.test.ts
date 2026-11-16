import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), settings: vi.fn(), resolve: vi.fn(), link: vi.fn(), revalidate: vi.fn(), log: vi.fn(),
  updated: [] as Record<string, unknown>[], rowsUpdated: 1,
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("./queries", () => ({ getOrCreateBudgetSettings: mocks.settings }));
vi.mock("./funding-partner", () => ({ resolveAgreementFundingPartner: mocks.resolve }));
vi.mock("@/lib/partners/find-or-create", () => ({ findOrCreatePartnerContact: mocks.link }));
vi.mock("./revalidate", () => ({ revalidateBudget: mocks.revalidate }));
vi.mock("@/lib/activity/log", () => ({ logActivity: mocks.log }));
vi.mock("@/lib/db", () => ({ db: { transaction: (work: (tx: unknown) => unknown) => work({
  update: () => ({ set: (value: Record<string, unknown>) => { mocks.updated.push(value); return { where: () => ({ returning: async () => Array.from({ length: mocks.rowsUpdated }, () => ({ projectId: "p" })) }) }; } }),
}) } }));

import { saveAgreementFundingPartner } from "./funding-partner-actions";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const agreementPartner = {
  partnerName: "Example Foundation", partnerContactFirstName: "Maly", partnerContactLastName: "Chan",
  partnerContactEmail: "maly@example.org", partnerContact: null, partnerId: null, partnerContactId: null, billingAddress: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updated.length = 0; mocks.rowsUpdated = 1;
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.settings.mockResolvedValue({ partnerName: null });
  mocks.resolve.mockResolvedValue(agreementPartner);
  mocks.link.mockResolvedValue({ partnerId: "partner-1", partnerContactId: "contact-1" });
});

it("saves the agreement's partner and links it to the saved directory", async () => {
  expect(await saveAgreementFundingPartner(PROJECT)).toEqual({ ok: true, data: { partnerName: "Example Foundation" } });
  expect(mocks.link).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ org: "Example Foundation", contactName: "Maly Chan", email: "maly@example.org" }));
  expect(mocks.updated[0]).toMatchObject({ partnerName: "Example Foundation", partnerContactEmail: "maly@example.org", partnerId: "partner-1", partnerContactId: "contact-1" });
  expect(mocks.revalidate).toHaveBeenCalledWith(PROJECT);
});

it("never replaces a partner someone already chose", async () => {
  mocks.settings.mockResolvedValue({ partnerName: "Chosen partner" });
  expect(await saveAgreementFundingPartner(PROJECT)).toEqual({ ok: true, data: { partnerName: "Chosen partner" } });
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.updated).toHaveLength(0);
});

it("reports a partner saved by someone else in the meantime instead of overwriting it", async () => {
  mocks.rowsUpdated = 0;
  const result = await saveAgreementFundingPartner(PROJECT);
  expect(result.ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it("writes nothing when the agreement names no partner", async () => {
  mocks.resolve.mockResolvedValue(null);
  expect((await saveAgreementFundingPartner(PROJECT)).ok).toBe(false);
  expect(mocks.updated).toHaveLength(0);
});

it("requires manager authorization", async () => {
  mocks.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(saveAgreementFundingPartner(PROJECT)).rejects.toThrow("Forbidden");
  expect(mocks.updated).toHaveLength(0);
});
