import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), after: vi.fn(), extract: vi.fn(), insert: vi.fn(),
  values: vi.fn(), update: vi.fn(), set: vi.fn(), returning: vi.fn(),
  transaction: vi.fn(), lesson: vi.fn(), redirect: vi.fn(), rows: [] as Record<string, unknown>[],
  pendingRows: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("./file-access", () => ({ getAccessibleExtractionFile: mocks.access }));
vi.mock("./extraction", () => ({ runExtraction: mocks.extract }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => Object.assign(Promise.resolve(mocks.rows), {
    limit: async () => mocks.rows,
    orderBy: () => Promise.resolve(mocks.pendingRows),
  }) }) }),
  insert: mocks.insert,
  update: mocks.update,
  transaction: mocks.transaction,
} }));
// Keep the unrelated commit/approval workflows outside this action boundary test.
vi.mock("@/lib/document-learning/service", () => ({ recordDocumentCase: mocks.lesson }));
vi.mock("@/lib/budget/approval-service", () => ({}));
vi.mock("@/lib/budget/queries", () => ({}));
vi.mock("@/lib/episodes/materialize", () => ({}));
vi.mock("@/lib/blockers/engine", () => ({}));
vi.mock("@/lib/obligations/generate", () => ({}));
vi.mock("@/lib/activity/log", () => ({}));
vi.mock("@/lib/agreements/readiness-engine", () => ({}));
vi.mock("@/lib/agreement-chat/indexing", () => ({}));
vi.mock("@/lib/workspace/queries", () => ({}));

import {
  createImportFromFile, createImportForPaymentInvoice, createImportsForProject,
  getImportStatus, updateImportDraft, enterImportManually, setImportTargetProject,
  saveImportAsLesson, discardImport, startParse, resumeStalledImports,
  commitImport, attachAgreementToProjects, applyImportedInvoice, applyImportToProject,
} from "./actions";
import { normalizeExtraction } from "./schema";

const updatedAt = new Date("2026-01-01T00:00:00.000Z");
const extraction = normalizeExtraction({ projects: [{ title: "Private source title" }] });
const invoiceInput = {
  paymentId: "11111111-1111-4111-8111-111111111111", invoiceNumber: "INV-1",
  issueDate: "2026-01-01", dueDate: null, amount: 100, currency: "USD",
  recipientName: null, recipientEmail: null,
  description: "Funding", receivedDate: "2026-01-02",
};
const updateOptions = {
  projectIndex: 0, applyDescription: true, applyDates: true,
  budgetMode: "replace" as const, applyRights: true,
};

function draft(status = "extracted") {
  return { id: "import", fileId: "file", createdBy: "inactive-original-creator",
    status, updatedAt, targetProjectId: "project", slug: "project",
    committedProjectIds: [], extraction, reviewed: extraction,
    error: "Private cached error", errorKind: "file" };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.access.mockResolvedValue({ id: "file" });
  mocks.rows = [{ id: "target", projectId: "project", sharedMouGroupId: null }];
  mocks.pendingRows = [];
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ returning: async () => [{ id: "import", updatedAt }] });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: () => Object.assign(Promise.resolve(), { returning: mocks.returning }) });
  mocks.returning.mockResolvedValue([{ id: "import", updatedAt }]);
  mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
});

const actions = [
  { name: "new document", run: () => createImportFromFile("file") },
  { name: "payment invoice", run: () => createImportForPaymentInvoice("file", "payment") },
  { name: "project update", run: () => createImportsForProject(["file"], "project") },
];

describe("import action file boundary", () => {
  it.each(actions)("rejects an inaccessible file for $name before writing or scheduling", async ({ run }) => {
    mocks.access.mockResolvedValue(null);
    expect(await run()).toMatchObject({ error: expect.any(String) });
    expect(mocks.auth).toHaveBeenCalledWith("manager");
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.extract).not.toHaveBeenCalled();
  });

  it.each(actions)("enqueues an authorized ready file for $name with its creator", async ({ run }) => {
    expect(await run()).not.toHaveProperty("error");
    const values = mocks.values.mock.calls[0][0];
    expect(Array.isArray(values) ? values[0] : values).toMatchObject({ fileId: "file", createdBy: "manager" });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.extract).toHaveBeenCalledWith("import", { actorUserId: "manager", updatedAt });
  });

  it("rejects a whole batch containing a forbidden file without scheduling a partial import", async () => {
    mocks.access.mockResolvedValueOnce({ id: "allowed" }).mockResolvedValueOnce(null);
    expect(await createImportsForProject(["allowed", "forbidden"], "project"))
      .toMatchObject({ error: expect.any(String) });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("cached import source boundary", () => {
  const consumers = [
    { name: "commit", run: () => commitImport("import", [{ index: 0, mode: "create" }]) },
    { name: "attach agreement", run: () => attachAgreementToProjects("import", ["project"]) },
    { name: "apply to project", run: () => applyImportToProject("import", updateOptions) },
    { name: "apply invoice", run: () => applyImportedInvoice("import", invoiceInput) },
  ];
  const mutations: { name: string; status?: string; run: () => Promise<{ error?: string }> }[] = [
    ...consumers,
    { name: "edit", run: () => updateImportDraft("import", extraction) },
    { name: "teach", run: () => saveImportAsLesson("import", extraction) },
    { name: "assign target", run: () => setImportTargetProject("import", "project") },
    { name: "retry", run: () => startParse("import", { force: true }) },
    { name: "reuse extracted status", run: () => startParse("import") },
    { name: "manual review", status: "failed", run: () => enterImportManually("import", "agreement") },
  ];

  it.each(mutations)("denies $name after the requesting manager loses source access", async ({ run, status }) => {
    mocks.rows = [draft(status)];
    mocks.access.mockResolvedValue(null);
    expect(await run()).toEqual({ error: expect.stringContaining("Source document unavailable") });
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.lesson).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(consumers)("cannot $name stale cached extraction after parsing fails", async ({ run }) => {
    mocks.rows = [draft("failed")];
    expect(await run()).toEqual({ error: "Review the document before saving." });
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("withholds cached extraction and errors from a removed requester, including after failure", async () => {
    mocks.access.mockResolvedValue(null);
    for (const status of ["extracted", "failed"]) {
      mocks.rows = [draft(status)];
      expect(await getImportStatus("import")).toEqual({
        status: "failed", error: expect.stringContaining("Source document unavailable"),
        errorKind: "file", extraction: null,
      });
    }
  });

  it("allows another authorized manager to read and edit system intake", async () => {
    mocks.rows = [{ ...draft(), createdBy: null, fundingSourceKey: "email-source" }];
    expect(await getImportStatus("import")).toMatchObject({ status: "extracted", extraction });
    expect(await updateImportDraft("import", extraction)).toEqual({});
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ reviewed: extraction }));
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
  });

  it("blocks discarding an inaccessible import", async () => {
    mocks.rows = [draft()];
    mocks.access.mockResolvedValue(null);
    await expect(discardImport("import")).rejects.toThrow("Source document unavailable");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(consumers)("preserves completed $name recovery even after access removal", async ({ run }) => {
    mocks.rows = [draft("committed")];
    mocks.access.mockResolvedValue(null);
    await expect(run()).rejects.toThrow("redirect:/projects");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("binds a replacement manager's retry to the claimed version without changing authorship", async () => {
    mocks.rows = [draft("failed")];
    // Extra client fields must never supply the background actor identity.
    const opts = { force: true, actorUserId: "inactive-original-creator" };
    expect(await startParse("import", opts)).toEqual({ status: "parsing" });
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("createdBy");
    await mocks.after.mock.calls[0][0]();
    expect(mocks.extract).toHaveBeenCalledWith("import", { actorUserId: "manager", updatedAt });
  });

  it("skips inaccessible queued imports after a completed update", async () => {
    mocks.rows = [draft("committed")];
    mocks.pendingRows = [{ id: "private", fileId: "private-file" }, { id: "shared", fileId: "shared-file" }];
    mocks.access.mockImplementation(async (fileId, actorId) =>
      fileId === "shared-file" && actorId === "manager" ? { id: fileId } : null);
    await expect(applyImportToProject("import", updateOptions)).rejects.toThrow("redirect:/projects/import/shared");
    expect(mocks.access).toHaveBeenCalledWith("private-file", "manager");
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.access.mockResolvedValue(null);
    await expect(applyImportToProject("import", updateOptions)).rejects.toThrow("redirect:/projects/project");
  });

  it("does not dispatch a retry after losing the claim to another request", async () => {
    mocks.rows = [draft("failed")];
    mocks.returning.mockResolvedValue([]);
    expect(await startParse("import")).toHaveProperty("error");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("resumes only accessible stalled drafts under the requesting manager", async () => {
    mocks.rows = [{ ...draft("parsing"), id: "private", fileId: "private" }, draft("parsing")];
    mocks.access.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "file" });
    expect(await resumeStalledImports()).toEqual({ resumed: 1 });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.extract).toHaveBeenCalledWith("import", { actorUserId: "manager", updatedAt });
  });
});
