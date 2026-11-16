import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ role: vi.fn(), transaction: vi.fn(), set: vi.fn(), activity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: mocks.activity }));
vi.mock("@/lib/hosted/tick-request", () => ({ requestScheduledTick: vi.fn() }));
vi.mock("@/lib/lectio/cloud-eligibility", () => ({ assertLectioCloudEligibility: vi.fn() }));

import { completeWorkspaceSetup, updateWorkspaceSettings } from "./actions";
import { invoiceSequences, workspaceSettings } from "@/lib/db/schema";

let currentNumber: number;
let existingNumbers: string[];
const fields = { legalName: "Legal ministry", sourceLanguage: "English", targetLanguage: "Khmer" };
beforeEach(() => {
  vi.resetAllMocks();
  currentNumber = 12;
  existingNumbers = ["INV-0011"];
  mocks.role.mockResolvedValue({ user: { id: "admin" } });
  mocks.set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  mocks.transaction.mockImplementation(async (run) => run({
    update: (table: unknown) => ({ set: (values: object) => mocks.set(table, values) }),
    select: () => ({ from: (table: unknown) => table === invoiceSequences
      ? { where: () => ({ for: async () => [{ prefix: "INV-", nextNumber: currentNumber }] }) }
      : Promise.resolve(existingNumbers.map(invoiceNumber => ({ invoiceNumber }))) }),
  }));
});

// The reported bug prevented every defaults save, even with a configured organization.
it("saves ordinary defaults without resubmitting branding or rerunning setup", async () => {
  expect(await updateWorkspaceSettings(fields)).toEqual({});
  const saved = mocks.set.mock.calls[0][1];
  expect(saved).toMatchObject(fields);
  expect(saved).not.toHaveProperty("orgName");
  expect(saved).not.toHaveProperty("setupCompletedAt");
  expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ action: "update" }));
});

it("still requires all setup fields and reports the field that is actually absent", async () => {
  expect(await completeWorkspaceSetup(fields)).toMatchObject({ fieldErrors: { orgName: expect.any(String) } });
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(await completeWorkspaceSetup({ ...fields, orgName: "Ministry" })).toEqual({});
  expect(mocks.set.mock.calls[0][1]).toMatchObject({ setupCompletedAt: expect.any(Date) });
});

it.each(["orgName", "sourceLanguage", "targetLanguage"])("prevents clearing %s and redirecting a configured workspace back into setup", async (key) => {
  expect(await updateWorkspaceSettings({ [key]: "  " })).toMatchObject({ fieldErrors: { [key]: expect.any(String) } });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("saves branding, defaults, and numbering through one transaction", async () => {
  expect(await updateWorkspaceSettings({ ...fields, orgName: "Ministry", invoiceSequence: { prefix: "INV-", nextNumber: 20, padding: 4, previousNextNumber: 12 } })).toEqual({});
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.set).toHaveBeenCalledWith(workspaceSettings, expect.objectContaining({ orgName: "Ministry", ...fields }));
  expect(mocks.set).toHaveBeenCalledWith(invoiceSequences, expect.objectContaining({ prefix: "INV-", nextNumber: 20, padding: 4 }));
});

it("does not partially save settings when numbering would reuse an issued invoice", async () => {
  expect(await updateWorkspaceSettings({ ...fields, invoiceSequence: { prefix: "INV-", nextNumber: 11, padding: 4, previousNextNumber: 12 } })).toMatchObject({ fieldErrors: { invoiceSequence: expect.any(String) } });
  expect(mocks.set).not.toHaveBeenCalled();
  expect(mocks.activity).not.toHaveBeenCalled();
});

it("preserves numbers issued after the form opened and prevents rewinding even numbers reserved but not yet issued", async () => {
  currentNumber = 15;
  expect(await updateWorkspaceSettings({ invoiceSequence: { prefix: "INV-", nextNumber: 12, previousNextNumber: 12, padding: 5 } })).toEqual({});
  expect(mocks.set).toHaveBeenCalledWith(invoiceSequences, expect.objectContaining({ nextNumber: 15, padding: 5 }));
  mocks.set.mockClear();
  expect(await updateWorkspaceSettings({ invoiceSequence: { prefix: "INV-", nextNumber: 13, previousNextNumber: 12, padding: 5 } })).toMatchObject({ fieldErrors: { invoiceSequence: expect.stringContaining("15") } });
  expect(mocks.set).not.toHaveBeenCalled();
});

it("requires protected admin access before saving shared settings", async () => {
  mocks.role.mockRejectedValue(new Error("Admin access required"));
  await expect(updateWorkspaceSettings(fields)).rejects.toThrow("Admin access required");
  expect(mocks.role).toHaveBeenCalledWith("admin");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
