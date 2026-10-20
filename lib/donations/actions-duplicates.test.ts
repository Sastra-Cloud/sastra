import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  auth: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
  reviews: [] as Array<Record<string, unknown>>,
  returned: [] as Array<{ id: string }>,
}));
vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("@/lib/auth/guards", () => ({ requireDonationAdmin: mocks.auth }));
vi.mock("@/lib/agreements/readiness-engine", () => ({
  reevaluateSharedMouPayments: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  reopenDonationDuplicates,
  resolveDonationDuplicate,
  resolveDonationDuplicates,
} from "./actions";

const id = (last: number) =>
  `00000000-0000-4000-8000-${String(last).padStart(12, "0")}`;

const tx = {
  update: () => ({
    set: (values: Record<string, unknown>) => {
      mocks.updates.push(values);
      const where = () => ({ returning: async () => mocks.returned });
      return { where };
    },
  }),
  insert: () => ({
    values: async (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
      mocks.reviews.push(...(Array.isArray(values) ? values : [values]));
    },
  }),
};

function selectReturns(rows: unknown[]) {
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => rows }) }),
  });
}

beforeEach(() => {
  mocks.updates.length = 0;
  mocks.reviews.length = 0;
  mocks.returned = [];
  mocks.auth.mockResolvedValue({ user: { id: "admin" } });
  mocks.transaction.mockImplementation(async (run: (t: typeof tx) => unknown) =>
    run(tx)
  );
});

describe("duplicate review", () => {
  it("confirms one duplicate without a typed reason", async () => {
    selectReturns([{ id: id(1), status: "possible_duplicate" }]);

    await expect(
      resolveDonationDuplicate({ donationId: id(1), resolution: "duplicate" })
    ).resolves.toEqual({});
    expect(mocks.updates[0]).toMatchObject({
      reviewStatus: "duplicate",
      duplicateResolutionNote:
        "Same donor, amount, and date as a donation already in Sastra.",
    });
    expect(mocks.reviews[0]).toMatchObject({ action: "confirmed_duplicate" });
  });

  it("still needs a reason to keep a lookalike as a separate gift", async () => {
    await expect(
      resolveDonationDuplicate({ donationId: id(1), resolution: "distinct" })
    ).resolves.toEqual({
      error: "Add a short reason why this is a separate gift.",
    });
    expect(mocks.updates).toEqual([]);
  });

  it("confirms many duplicates and reports rows that already changed", async () => {
    mocks.returned = [{ id: id(1) }, { id: id(2) }];

    await expect(
      resolveDonationDuplicates({ donationIds: [id(1), id(2), id(3), id(1)] })
    ).resolves.toEqual({ resolved: 2, skipped: 1 });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({ reviewStatus: "duplicate" });
    expect(mocks.reviews.map((row) => row.donationId)).toEqual([id(1), id(2)]);
  });

  it("returns confirmed duplicates to review on undo", async () => {
    mocks.returned = [{ id: id(1) }];

    await expect(
      reopenDonationDuplicates({ donationIds: [id(1)] })
    ).resolves.toEqual({ reopened: 1 });
    expect(mocks.updates[0]).toMatchObject({
      reviewStatus: "possible_duplicate",
      duplicateResolutionNote: null,
    });
    expect(mocks.reviews[0]).toMatchObject({ action: "duplicate_reopened" });
  });

  it("rejects an empty bulk selection", async () => {
    await expect(resolveDonationDuplicates({ donationIds: [] })).resolves.toEqual(
      { error: "Choose the donations again." }
    );
  });
});
