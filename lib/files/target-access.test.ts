import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(),
  head: vi.fn(), remove: vi.fn(), messageAccess: vi.fn(),
  values: vi.fn(), grants: new Set<string>(),
}));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.session }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select, insert: mocks.insert, update: mocks.update } }));
vi.mock("@/lib/chat/access", () => ({ canAccessMessage: mocks.messageAccess }));
vi.mock("@/lib/r2", () => ({ headObject: mocks.head, deleteObject: mocks.remove, validateUpload: () => null }));
vi.mock("@/lib/ai/usage", () => ({ recordR2Operation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/print/payment-tasks", () => ({ ensurePrintPaymentTask: vi.fn() }));
vi.mock("@/lib/agreement-chat/indexing", () => ({ enqueueAndProcessAgreementAttachment: vi.fn() }));
vi.mock("@/lib/hosted/storage-usage", () => ({ assertStorageAvailable: vi.fn().mockResolvedValue({ ok: true }) }));

import { projectManagers } from "@/lib/db/schema";

import { POST } from "@/app/api/files/complete/route";
import { canMutateAttachmentTarget } from "./target-access";

const member = { id: "member", role: "member", isActive: true };
const fileId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
function request(target: Record<string, unknown> = { targetType: "rights_item", targetId }) {
  return new Request("https://sastra.example/api/files/complete", {
    method: "POST", body: JSON.stringify({ fileId, label: "supporting", ...target }),
  });
}
function rows(value: unknown[]) {
  mocks.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
    limit: async () => table === projectManagers
      ? (mocks.grants.has(new PgDialect().sqlToQuery(condition).params.join(":")) ? [{ id: "grant" }] : [])
      : value,
  }) }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.grants = new Set();
  mocks.session.mockResolvedValue({ user: member });
  rows([{ id: fileId, uploadedBy: member.id, purpose: "workspace_attachment",
    status: "pending", mimeType: "application/pdf", r2Key: "fixture/file", sizeBytes: 100 }]);
  mocks.head.mockResolvedValue({ contentType: "application/pdf", size: 100 });
  mocks.update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) });
  mocks.values.mockReturnValue({ returning: async () => [{ id: "attachment" }] });
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("attachment target authorization", () => {
  it("enforces manager capabilities for operational documents and fails closed on unknown types", async () => {
    for (const target of ["rights_item", "budget_item", "project", "print_quote", "print_payment", "license_fee_payment", "agreement_group", "email_message"]) {
      expect(await canMutateAttachmentTarget(target, targetId, member)).toBe(false);
      expect(await canMutateAttachmentTarget(target, targetId, { ...member, role: "manager" })).toBe(true);
    }
    expect(await canMutateAttachmentTarget("unknown", targetId, { ...member, role: "admin" })).toBe(false);
  });

  it("uses current message membership instead of trusting possession of a target ID", async () => {
    mocks.messageAccess.mockResolvedValue(false);
    expect(await canMutateAttachmentTarget("message", targetId, member)).toBe(false);
    mocks.messageAccess.mockResolvedValue(true);
    expect(await canMutateAttachmentTarget("message", targetId, member)).toBe(true);
    expect(mocks.messageAccess).toHaveBeenCalledWith(targetId, member.id);
  });

  it("limits task attachment changes to managers and the task owner", async () => {
    rows([{ projectId: null, assignedTo: "other", createdBy: member.id }]);
    expect(await canMutateAttachmentTarget("task", targetId, member)).toBe(false);
    expect(await canMutateAttachmentTarget("task", targetId, { ...member, role: "manager" })).toBe(true);
    rows([{ projectId: null, assignedTo: member.id, createdBy: "other" }]);
    expect(await canMutateAttachmentTarget("task", targetId, member)).toBe(true);
    rows([{ projectId: null, assignedTo: null, createdBy: member.id }]);
    expect(await canMutateAttachmentTarget("task", targetId, member)).toBe(true);
  });

  it("honors current scoped grants for task and project targets without granting financial access", async () => {
    const projectId = "00000000-0000-4000-8000-000000000003";
    rows([{ projectId, assignedTo: "other", createdBy: "other" }]);
    mocks.grants.add(`${projectId}:${member.id}`);
    expect(await canMutateAttachmentTarget("task", targetId, member)).toBe(true);
    expect(await canMutateAttachmentTarget("project", projectId, member)).toBe(true);
    expect(await canMutateAttachmentTarget("project", targetId, member)).toBe(false);
    expect(await canMutateAttachmentTarget("rights_item", projectId, member)).toBe(false);
    rows([{ projectId: targetId, assignedTo: "other", createdBy: "other" }]);
    expect(await canMutateAttachmentTarget("task", targetId, member)).toBe(false);
    rows([{ projectId, assignedTo: "other", createdBy: "other" }]);
    mocks.grants.clear();
    expect(await canMutateAttachmentTarget("task", targetId, member)).toBe(false);
    expect(await canMutateAttachmentTarget("project", projectId, member)).toBe(false);
  });

  it("rejects member upload completion before touching storage or attachment rows", async () => {
    expect((await POST(request())).status).toBe(403);
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("completes a manager's valid owned upload", async () => {
    mocks.session.mockResolvedValue({ user: { ...member, role: "manager" } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith({ fileId, targetType: "rights_item", targetId, label: "supporting" });
  });

  it("completes project uploads for scoped managers and rejects uploads after revocation", async () => {
    mocks.grants.add(`${targetId}:${member.id}`);
    expect((await POST(request({ targetType: "project", targetId }))).status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith({ fileId, targetType: "project", targetId, label: "supporting" });
    vi.clearAllMocks();
    mocks.grants.clear();
    expect((await POST(request({ targetType: "project", targetId }))).status).toBe(403);
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects partial attachment targets instead of completing an unscoped upload", async () => {
    expect((await POST(request({ targetId }))).status).toBe(400);
    expect(mocks.head).not.toHaveBeenCalled();
  });
});
