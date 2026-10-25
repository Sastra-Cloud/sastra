import { beforeEach, expect, it, vi } from "vitest";
import { activityLog, lectioSsoClients, lectioSsoIdentities, lectioUserLinks, user } from "@/lib/db/schema";
import { resolveSsoIdentity } from "./sso-service";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), identity: null as null | { id: string; userId: string },
  membership: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  select: mocks.select, insert: mocks.insert,
  transaction: async (run: (tx: unknown) => unknown) => run({ select: mocks.select, insert: mocks.insert }),
} }));
vi.mock("./guard", () => ({ lockActiveConnection: async () => ({ id: "connection-1", origin: "https://lectio.example", teamId: "team-1" }) }));
vi.mock("./cloud-eligibility", () => ({ assertLectioCloudEligibility: async () => "instance-1" }));
vi.mock("./client", () => ({ lectioRequest: mocks.membership }));

const issuer = "https://lectio.example/api/auth";
const local = { id: "sastra-person", name: "Teammate", email: "sastra-person@example.test", role: "manager", isActive: true, isBot: false };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity = null;
  mocks.membership.mockResolvedValue({ active: true, teamId: "team-1" });
  mocks.select.mockReturnValue({ from: (table: unknown) => ({ where: () => {
    const rows = table === lectioSsoClients ? [{ enabled: true, issuer }] : table === lectioSsoIdentities ? mocks.identity ? [mocks.identity] : [] : table === user ? [local] : [];
    return Object.assign(Promise.resolve(rows), { for: async () => rows });
  } }) });
  mocks.insert.mockImplementation((table: unknown) => ({ values: (values: unknown) => table === lectioSsoIdentities
    ? { returning: async () => [{ id: "identity-1", ...(values as object) }] }
    : Promise.resolve() }));
});

it("links an authenticated subject to the existing Sastra account and preserves its role", async () => {
  const result = await resolveSsoIdentity({ connectionId: "connection-1", issuer, subject: "lectio-person", linkUserId: local.id });
  expect(result.identity).toMatchObject({ userId: local.id, issuer, subject: "lectio-person" });
  expect(result.user).toBe(local);
  expect(mocks.insert.mock.calls.map(([table]) => table)).toEqual([lectioSsoIdentities, activityLog, lectioUserLinks]);
});

it("refuses an unlinked subject's login instead of selecting an existing account by email", async () => {
  await expect(resolveSsoIdentity({ connectionId: "connection-1", issuer, subject: "unlinked-person" })).rejects.toThrow("link Lectio");
  expect(mocks.insert).not.toHaveBeenCalled();
});

it("cannot rebind an existing Lectio identity to a different Sastra account", async () => {
  mocks.identity = { id: "existing-identity", userId: "another-sastra-person" };
  await expect(resolveSsoIdentity({ connectionId: "connection-1", issuer, subject: "lectio-person", linkUserId: local.id })).rejects.toThrow("already linked");
  expect(mocks.insert).not.toHaveBeenCalled();
});
