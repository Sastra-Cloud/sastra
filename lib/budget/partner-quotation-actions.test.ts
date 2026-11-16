import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  transaction: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.guard }));
vi.mock("@/lib/db", () => ({
  db: { transaction: mocks.transaction, delete: mocks.remove },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./approval-service", () => ({ syncBudgetApprovalState: vi.fn() }));
import {
  savePartnerQuotation,
  deletePartnerQuotation,
} from "./partner-quotation-actions";
import type { PartnerQuotationInput } from "./partner-quotations";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failQuotation: boolean;
const input: PartnerQuotationInput = {
  id: "10000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000002",
  printRunId: null,
  title: "Audio production",
  partnerId: "10000000-0000-4000-8000-000000000003",
  partnerName: "Example partner",
  contactName: "Alex Example",
  contactEmail: "alex@example.org",
  description: "",
  lines: [{ budgetItemId: "10000000-0000-4000-8000-000000000004", amountCents: 10000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  failQuotation = false;
  tables = {
    projects: [{ id: input.projectId, slug: "book" }],
    project_budget_settings: [{ currency: "USD" }],
    budget_items: [{ id: input.lines[0].budgetItemId, label: "Audio", partnerVisible: true, quantity: "1", unitPrice: "100", amount: "100" }],
    budget_scope_presentations: [],
    project_partner_quotations: [],
    partners: [{ id: input.partnerId, name: "Other partner" }],
    partner_contacts: [],
  };
  mocks.guard.mockResolvedValue({ user: { id: "manager" } });
  mocks.transaction.mockImplementation(async (run) => {
    const staged = structuredClone(tables);
    const tx = {
      execute: vi.fn(),
      select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const name = getTableName(table);
          const { params } = new PgDialect().sqlToQuery(condition);
          let rows = staged[name] ?? [];
          if (name === "partners") rows = rows.filter((row) => row.id === params[0] || String(row.name).trim().toLowerCase() === params[0]);
          if (name === "partner_contacts") rows = rows.filter((row) => row.partnerId === params[0]);
          if (name === "project_partner_quotations") rows = rows.filter((row) => row.projectId === params[0] || row.id === params[0]);
          return Object.assign(Promise.resolve(rows), { orderBy: async () => rows });
        },
      }) }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (values: Row) => {
        const name = getTableName(table);
        if (name === "project_partner_quotations" && failQuotation) throw new Error("write failed");
        const row = { id: `20000000-0000-4000-8000-${String(staged[name].length + 1).padStart(12, "0")}`, ...values };
        staged[name].push(row);
        return Object.assign(Promise.resolve(), { returning: async () => [row] });
      } }),
      update: (table: Parameters<typeof getTableName>[0]) => ({ set: (values: Row) => ({
        where: async (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const { params } = new PgDialect().sqlToQuery(condition);
          Object.assign(staged[getTableName(table)].find((row) => row.id === params[0])!, values);
        },
      }) }),
    };
    const result = await run(tx);
    tables = staged;
    return result;
  });
});

it("requires manager permission before either partner-share write boundary", async () => {
  mocks.guard.mockRejectedValue(new Error("denied"));
  await expect(
    savePartnerQuotation({} as PartnerQuotationInput),
  ).rejects.toThrow("denied");
  await expect(deletePartnerQuotation("project", "quote")).rejects.toThrow(
    "denied",
  );
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

// A name typed over a selected partner must not attach the wrong organization
// to a financial request, and retries must not duplicate directory records.
it("links a typed partner and contact to the saved quotation, reusing them on retry", async () => {
  const result = await savePartnerQuotation(input);
  expect(result).toHaveProperty("quotation.partnerId");
  const saved = tables.project_partner_quotations[0];
  expect(saved.partnerId).not.toBe(input.partnerId);
  expect(tables.partners).toEqual([
    { id: input.partnerId, name: "Other partner" },
    expect.objectContaining({ id: saved.partnerId, name: "Example partner", createdBy: "manager" }),
  ]);
  expect(tables.partner_contacts).toEqual([
    expect.objectContaining({ partnerId: saved.partnerId, firstName: "Alex Example", email: input.contactEmail, isPrimary: true }),
  ]);
  expect(await savePartnerQuotation({ ...input, partnerName: " EXAMPLE PARTNER ", contactEmail: "ALEX@example.org" })).not.toHaveProperty("error");
  expect(tables.partners).toHaveLength(2);
  expect(tables.partner_contacts).toHaveLength(1);
  expect(tables.project_partner_quotations).toHaveLength(1);
});

it("leaves no directory records behind when the quotation write fails", async () => {
  failQuotation = true;
  expect(await savePartnerQuotation(input)).toHaveProperty("error");
  expect(tables.partners).toEqual([{ id: input.partnerId, name: "Other partner" }]);
  expect(tables.partner_contacts).toEqual([]);
  expect(tables.project_partner_quotations).toEqual([]);
});
