import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.guard }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createPartner } from "./actions";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failContact: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  tables = { partners: [], partner_contacts: [] };
  failContact = false;
  mocks.guard.mockResolvedValue({ user: { id: "manager" } });
  mocks.transaction.mockImplementation(async (run) => {
    const staged = structuredClone(tables);
    const tx = {
      execute: vi.fn(),
      select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => ({
        where: async (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const name = getTableName(table);
          const { params } = new PgDialect().sqlToQuery(condition);
          return staged[name].filter((row) => name === "partners"
            ? String(row.name).trim().toLowerCase() === params[0] : row.partnerId === params[0]);
        },
      }) }),
      insert: (table: Parameters<typeof getTableName>[0]) => ({ values: (values: Row) => {
        const name = getTableName(table);
        if (name === "partner_contacts" && failContact) throw new Error("contact write failed");
        const row = { id: `${name}-${staged[name].length}`, ...values };
        staged[name].push(row);
        return { returning: async () => [row] };
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

const input = { name: "Example Foundation", website: "https://example.org", billingAddress: "123 Main St\nCity", notes: "Directory note",
  contact: { firstName: "Alex", lastName: "Example", email: "alex@example.org", phone: "+1 555 0100", role: "Director" } };

// Losing either half makes saved partners unusable for later invoices and emails.
it("saves the full partner and primary contact together, reuses them on retry, and preserves directory edits", async () => {
  const saved = await createPartner(input);
  expect(tables.partners).toEqual([expect.objectContaining({ id: saved.id, name: input.name,
    website: input.website, billingAddress: input.billingAddress, notes: input.notes, createdBy: "manager" })]);
  expect(tables.partner_contacts).toEqual([expect.objectContaining({ ...input.contact, id: saved.contactId, partnerId: saved.id, isPrimary: true })]);
  tables.partners[0].billingAddress = "Edited directory address";
  tables.partner_contacts[0].phone = null;
  expect(await createPartner({ ...input, name: " EXAMPLE FOUNDATION ", contact: { ...input.contact, email: "ALEX@example.org" } })).toEqual(saved);
  expect(tables.partners).toHaveLength(1);
  expect(tables.partner_contacts).toHaveLength(1);
  expect(tables.partners[0].billingAddress).toBe("Edited directory address");
  expect(tables.partner_contacts[0].phone).toBe(input.contact.phone);
});

it("makes the first contact primary even if the partner was originally saved without contacts", async () => {
  const partner = await createPartner({ name: input.name });
  expect(partner.contactId).toBeNull();
  expect((await createPartner(input)).id).toBe(partner.id);
  expect(tables.partner_contacts[0].isPrimary).toBe(true);
});

it("rolls back the organization if its contact cannot be saved", async () => {
  failContact = true;
  await expect(createPartner(input)).rejects.toThrow("contact write failed");
  expect(tables).toEqual({ partners: [], partner_contacts: [] });
});

it("requires manager permission before a directory write", async () => {
  mocks.guard.mockRejectedValue(new Error("Forbidden"));
  await expect(createPartner(input)).rejects.toThrow("Forbidden");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
