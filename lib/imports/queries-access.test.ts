import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), rows: [] as Record<string, unknown>[] }));
vi.mock("./file-access", () => ({ getAccessibleExtractionFile: mocks.access }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: () => ({
    limit: async () => mocks.rows,
  }) }) }) }),
} }));

import { listImports } from "./queries";

function row(id: string, fileId: string | null, status = "extracted") {
  return {
    id, fileId, status, fileName: `${id}.pdf`,
    extraction: { projects: [{ title: `${id} source title` }] },
    reviewed: { projects: [{ title: `${id} reviewed title` }] },
    error: `${id} cached error`, targetProjectId: null, committedProjectIds: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows = [];
});

it("omits inaccessible cached metadata while preserving accessible imports regardless of authorship", async () => {
  mocks.rows = [
    row("private-ready", "private"),
    row("private-failed", "private", "failed"),
    row("deleted-source", null),
    { ...row("shared", "shared"), createdBy: "former-manager" },
    { ...row("system", "email"), createdBy: null, fundingSourceKey: "fingerprint" },
  ];
  mocks.access.mockImplementation(async (fileId: string, actorId: string) =>
    actorId === "replacement-manager" && ["shared", "email"].includes(fileId) ? { id: fileId } : null);

  const result = await listImports("replacement-manager");
  expect(result.map((item) => item.id)).toEqual(["shared", "system"]);
  expect(result[0]).toMatchObject({ fileName: "shared.pdf", firstTitle: "shared reviewed title", projectCount: 1 });
  expect(JSON.stringify(result)).not.toMatch(/private|deleted-source/);
  expect(mocks.access).toHaveBeenCalledWith("private", "replacement-manager");
  expect(mocks.access).toHaveBeenCalledWith("email", "replacement-manager");
});

it("rechecks the requester on each list read after source access is revoked", async () => {
  mocks.rows = [row("source", "file")];
  mocks.access.mockResolvedValueOnce({ id: "file" }).mockResolvedValueOnce(null);
  expect(await listImports("manager")).toHaveLength(1);
  expect(await listImports("manager")).toEqual([]);
  expect(mocks.access).toHaveBeenCalledTimes(2);
});
