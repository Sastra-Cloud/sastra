import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn(), create: vi.fn(), queue: vi.fn(), matches: vi.fn(), transaction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: async () => ({ user: { id: "manager" } }) }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, transaction: mocks.transaction } }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: async () => ({ enabledModules: ["lectio"] }) }));
vi.mock("@/lib/slug", () => ({ uniqueProjectSlug: async () => "new-book" }));
vi.mock("./create", async original => ({ ...await original<typeof import("./create")>(), createProjectInTransaction: mocks.create }));
vi.mock("@/lib/lectio/create-project", () => ({ queueLectioProject: mocks.queue }));
vi.mock("@/lib/lectio/match-actions", () => ({ findLectioProjectMatches: mocks.matches }));
import { createProject } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ id: "con" }] }) });
  mocks.create.mockResolvedValue({ id: "native-project" });
  mocks.transaction.mockImplementation(async run => run("tx"));
  mocks.matches.mockResolvedValue({ projects: [{ id: "existing-lectio" }] });
});
function form(choice?: string) {
  const data = new FormData(); data.set("title", "New book"); data.set("kind", "book");
  data.set("lectioConnectionId", "con"); if (choice) data.set("lectioChoice", choice); return data;
}
it("requires an explicit match review before any connected native project or counterpart is created", async () => {
  expect(await createProject({}, form())).toHaveProperty("error");
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
});
it("revalidates an existing choice before native creation, then opens mapping without creating a counterpart", async () => {
  const data = form("existing"); data.set("lectioRemoteProjectId", "existing-lectio");
  mocks.matches.mockResolvedValueOnce({ projects: [] });
  expect(await createProject({}, data)).toHaveProperty("error"); expect(mocks.create).not.toHaveBeenCalled();
  await expect(createProject({}, data)).rejects.toThrow("redirect:/projects/new-book/translation?lectioConnectionId=con&lectioProjectId=existing-lectio");
  expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.queue).not.toHaveBeenCalled();
});
it("preserves native-only creation when the person turns the connection off", async () => {
  const data = form(); data.set("lectioConnectionId", "none");
  await expect(createProject({}, data)).rejects.toThrow("redirect:/projects/new-book?created=1");
  expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled();
});
it("rechecks creation consent before committing the native project and queues an approved new counterpart in its transaction", async () => {
  const data = form("new");
  mocks.matches.mockResolvedValueOnce({ projects: [], allowNew: false });
  expect(await createProject({}, data)).toHaveProperty("error"); expect(mocks.create).not.toHaveBeenCalled();
  mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ id: "con", profile: { version: 1, kind: "book", planTemplateId: "template", teamWorkflowId: "workflow", stageMap: [{ stepKey: "step", phaseId: "phase" }], handoffPhaseTemplateId: null, deliverFiles: false } }] }) });
  mocks.matches.mockResolvedValue({ projects: [], allowNew: true });
  await expect(createProject({}, data)).rejects.toThrow("redirect:/projects/new-book?created=1");
  expect(mocks.create).toHaveBeenCalledWith("tx", expect.objectContaining({ data: expect.objectContaining({ planTemplateId: "template" }) }));
  expect(mocks.queue).toHaveBeenCalledWith("tx", "con", "native-project");
});
