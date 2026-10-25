import { expect, it, vi } from "vitest";
import { settleDisconnect } from "./disconnect-ack";
import { lectioConnections, lectioProjectLinks } from "@/lib/db/schema";

function fixture(link: Record<string, unknown>) {
  const remove = vi.fn(), values = vi.fn(), update = vi.fn(() => ({ set: (value: unknown) => { values(value); return { where: vi.fn() }; } }));
  return { remove, values, tx: { select: () => ({ from: (table: unknown) => ({ where: () => ({ for: async () => table === lectioConnections ? [] : [link] }) }) }),
    update, delete: (table: unknown) => { expect(table).toBe(lectioProjectLinks); return { where: remove }; } } };
}
const body = { projectKey: "key", generation: 1 };
const pending = { id: "link", generation: 1, state: "unlinked", remoteProjectId: "pending-key", lastVersion: 0, snapshot: null, stageMap: [] };
it("releases only an empty acknowledged cancellation and ignores a stale acknowledgement after reconnect", async () => {
  const empty = fixture(pending); await settleDisconnect(empty.tx as never, "con", body, { creationCancelled: true }); expect(empty.remove).toHaveBeenCalledOnce();
  const resumed = fixture({ ...pending, generation: 2, state: "active" }); await settleDisconnect(resumed.tx as never, "con", body, { creationCancelled: true }); expect(resumed.remove).not.toHaveBeenCalled();
  const history = fixture({ ...pending, remoteProjectId: "real-project" }); await settleDisconnect(history.tx as never, "con", body, { creationCancelled: true }); expect(history.remove).not.toHaveBeenCalled();
});
it("recovers a counterpart committed before the create response was lost instead of creating another one", async () => {
  const raced = fixture(pending); await settleDisconnect(raced.tx as never, "con", body, { counterpartProjectId: "real-project" });
  expect(raced.values).toHaveBeenCalledWith({ remoteProjectId: "real-project" }); expect(raced.remove).not.toHaveBeenCalled();
});
