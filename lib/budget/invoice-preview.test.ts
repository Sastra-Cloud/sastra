import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), access: vi.fn(), session: vi.fn(), getObject: vi.fn(), presign: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: mocks.limit }) }), where: () => ({ limit: mocks.limit }) }) }) } }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn(), getSession: mocks.session }));
vi.mock("@/lib/chat/access", () => ({ canAccessFile: mocks.access }));
vi.mock("@/lib/auth/assurance", () => ({ isAdminAssured: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/ai/usage", () => ({ recordR2Operation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/r2", () => ({ getObjectBuffer: mocks.getObject, presignGet: mocks.presign }));
import { GET as invoice } from "@/app/api/invoices/[invoiceId]/route";
import { GET as file } from "@/app/api/files/[id]/download/route";
beforeEach(() => {
 vi.clearAllMocks();
 mocks.session.mockResolvedValue({ user: { id: "user", isActive: true } });
 mocks.access.mockResolvedValue(true);
 mocks.getObject.mockResolvedValue(Buffer.from("%PDF-test"));
 mocks.presign.mockResolvedValue("https://storage.example/file");
});
for (const sourceFileId of [null, "source-file"]) {
 it(`keeps ${sourceFileId ? "source" : "generated"} invoice redirects relative behind a proxy`, async () => {
  mocks.limit.mockResolvedValue([{ sourceFileId, renderedFileId: "rendered-file" }]);
  const response = await invoice(new Request("https://localhost:3000/api/invoices/invoice?inline=1"), { params: Promise.resolve({ invoiceId: "invoice" }) });
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(`/api/files/${sourceFileId || "rendered-file"}/download?inline=1`);
 });
}
it("serves authorized inline PDF bytes without a cross-origin redirect", async () => {
 mocks.limit.mockResolvedValue([{ id: "file", status: "ready", mimeType: "application/pdf", r2Key: "private/pdf", originalName: "invoice.pdf" }]);
 const response = await file(new Request("https://sastra.example/api/files/file/download?inline=1"), { params: Promise.resolve({ id: "file" }) });
 expect(response.status).toBe(200);
 expect(response.headers.get("Content-Type")).toBe("application/pdf");
 expect(response.headers.get("Content-Disposition")).toBe("inline");
 expect(response.headers.get("Cache-Control")).toBe("private, no-store");
 expect(await response.text()).toBe("%PDF-test");
 expect(mocks.presign).not.toHaveBeenCalled();
});
it("never loads private PDF content without file authorization", async () => {
 mocks.limit.mockResolvedValue([{ id: "file", status: "ready", mimeType: "application/pdf" }]);
 mocks.access.mockResolvedValue(false);
 const response = await file(new Request("https://sastra.example/api/files/file/download?inline=1"), { params: Promise.resolve({ id: "file" }) });
 expect(response.status).toBe(404);
 expect(mocks.getObject).not.toHaveBeenCalled();
});
it("preserves ordinary attachment downloads", async () => {
 mocks.limit.mockResolvedValue([{ id: "file", status: "ready", mimeType: "application/pdf", r2Key: "private/pdf", originalName: "invoice.pdf" }]);
 const response = await file(new Request("https://sastra.example/api/files/file/download"), { params: Promise.resolve({ id: "file" }) });
 expect(response.headers.get("location")).toBe("https://storage.example/file");
 expect(mocks.presign).toHaveBeenCalledWith("private/pdf", "invoice.pdf");
 expect(mocks.getObject).not.toHaveBeenCalled();
});
