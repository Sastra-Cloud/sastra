import { expect, it, vi } from "vitest";
import { receiveProject } from "./receive-project";
import { applySnapshot } from "./projection";
const mocks = vi.hoisted(() => ({ create: vi.fn(async () => ({ id: "created-project" })) }));
vi.mock("@/lib/projects/create", () => ({ createProjectSchema: { parse: (value: unknown) => value }, createProjectInTransaction: mocks.create }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: async () => ({}) }));
vi.mock("./profile", () => ({ resolveProfile: async () => ({ stageMap: [] }) }));
vi.mock("./projection", () => ({ applySnapshot: vi.fn() }));
it("keeps creation working after reapproval when the original approving account was deleted", async () => {
  const profile = { version: 1, planTemplateId: "template", teamWorkflowId: "workflow", kind: "book", deliverFiles: false, handoffPhaseTemplateId: null, stageMap: [{ stepKey: "step", phaseId: "phase" }], connectionApproval: { actorId: "replacement-admin" } };
  const connection = { id: "con", epoch: "epoch", autoCreate: true, pairedBy: null, profile };
  const select = vi.fn().mockReturnValue({ from: () => ({ where: () => Object.assign(Promise.resolve([]), { for: async () => [{ id: "replacement-admin", isActive: true, role: "admin" }] }) }) });
  const tx = { select, insert: () => ({ values: async () => undefined }) };
  const snapshot = { protocol: 1, connectionId: "con", epoch: "epoch", generation: 1, version: 1, people: [], steps: [], documents: [], allRequiredWorkComplete: false,
    project: { id: "remote-project", name: "Book", sourceLanguage: "en", targetLanguage: "fr", status: "active" } };
  expect(await receiveProject(tx as never, connection as never, { projectKey: "key", profileVersion: 1, snapshot })).toMatchObject({ remoteProjectId: "created-project" });
  expect(mocks.create).toHaveBeenCalledWith(tx, expect.objectContaining({ actorId: "replacement-admin" }));
});

it("creates only the explicitly requested counterpart and waits for mapping before projecting existing translation work", async () => {
  vi.clearAllMocks();
  const profile = { version: 1, planTemplateId: "template", teamWorkflowId: "workflow", kind: "book", deliverFiles: false, handoffPhaseTemplateId: null, stageMap: [{ stepKey: "step", phaseId: "phase" }], connectionApproval: { actorId: "admin" } };
  const select = vi.fn().mockReturnValue({ from: () => ({ where: () => Object.assign(Promise.resolve([]), { for: async () => [{ id: "admin", isActive: true, role: "admin" }] }) }) });
  const values = vi.fn(), tx = { select, insert: () => ({ values }) };
  const snapshot = { protocol: 1, connectionId: "con", epoch: "epoch", generation: 1, version: 1, people: [], steps: [], documents: [], allRequiredWorkComplete: false,
    project: { id: "remote-project", name: "Existing translation", sourceLanguage: "en", targetLanguage: "fr", status: "active" } };
  expect(await receiveProject(tx as never, { id: "con", epoch: "epoch", autoCreate: true, profile } as never, { projectKey: "key", profileVersion: 1, snapshot, reviewBeforeLink: true })).toMatchObject({ reviewRequired: true, appliedVersion: 0 });
  expect(values).toHaveBeenCalledWith(expect.objectContaining({ stageMap: [], handoffPhaseId: null }));
  expect(applySnapshot).not.toHaveBeenCalled();
});
