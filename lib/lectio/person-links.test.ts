import { beforeEach, expect, it, vi } from "vitest";
import { activityLog, lectioConnections, lectioProjectLinks, lectioSsoIdentities, lectioUserLinks, user } from "@/lib/db/schema";
import { confirmLectioPerson, removeLectioPerson } from "./actions";
import { applySnapshot } from "./projection";

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), remove: vi.fn(),
  verified: [] as { userId: string; subject: string }[], localId: "local-1" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: async () => ({ user: { id: "admin-1" } }) }));
vi.mock("@/lib/workspace/module-guard", () => ({ requireWorkspaceModule: vi.fn() }));
vi.mock("./guard", () => ({ lockActiveConnection: async () => ({ id: "con-1", origin: "https://lectio.example" }) }));
vi.mock("./client", () => ({ lectioRequest: async () => ({ people: [{ id: "remote-1", name: "Person", email: "lectio@example.test" }] }) }));
vi.mock("./projection", () => ({ applySnapshot: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select,
  transaction: async (run: (tx: unknown) => unknown) => run({ select: mocks.select, insert: mocks.insert, update: mocks.update, delete: mocks.remove }),
} }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.verified = []; mocks.localId = "local-1";
  mocks.select.mockReturnValue({ from: (table: unknown) => ({ where: () => {
    const rows = table === lectioUserLinks ? [{ id: "match-1", userId: mocks.localId, remoteUserId: "remote-1" }] : table === lectioSsoIdentities ? mocks.verified : table === lectioConnections ? [{ id: "con-1", state: "active" }] : table === lectioProjectLinks ? [{ id: "link-1", snapshot: { version: 7 } }] : table === user ? [{ id: "other-local" }] : [];
    return Object.assign(Promise.resolve(rows), { for: async () => rows });
  } }) });
  mocks.insert.mockReturnValue({ values: async () => undefined });
  mocks.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
  mocks.remove.mockReturnValue({ where: async () => undefined });
});

it("removes only the reviewed match, parks its requests and refreshes projected assignments with an audit event", async () => {
  expect(await removeLectioPerson("con-1", "remote-1", "local-1")).toEqual({ saved: true });
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(lectioUserLinks);
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(applySnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "con-1" }), { version: 7 }, { mappingReview: true });
  expect(mocks.insert).toHaveBeenCalledWith(activityLog);
});

it("rejects a stale correction and a verified identity without deleting either person's binding", async () => {
  mocks.localId = "changed-local";
  expect(await removeLectioPerson("con-1", "remote-1", "local-1")).toHaveProperty("error");
  mocks.localId = "local-1"; mocks.verified = [{ userId: "local-1", subject: "remote-1" }];
  expect(await removeLectioPerson("con-1", "remote-1", "local-1")).toMatchObject({ error: expect.stringContaining("unlink shared sign-in") });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("cannot use an administrative progress match to overwrite a verified sign-in identity", async () => {
  mocks.verified = [{ userId: "local-1", subject: "remote-1" }];
  expect(await confirmLectioPerson("con-1", "remote-1", "other-local")).toMatchObject({ error: expect.stringContaining("different verified") });
  expect(mocks.insert).not.toHaveBeenCalled();
});
