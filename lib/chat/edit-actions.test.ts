import { beforeEach, describe, expect, it, vi } from "vitest";
import { editMessage } from "./edit-actions";
import { requireUser } from "@/lib/auth/guards";
import { requireMessageAccess } from "./access";

const query = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn(), returning: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("./access", () => ({ requireMessageAccess: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: query.read }) }) }),
  update: (...args: unknown[]) => { query.update(...args); return { set: () => ({ where: () => ({ returning: query.returning }) }) }; },
} }));
const id = "00000000-0000-4000-8000-000000000001";
const input = { messageId: id, content: "Corrected", expectedContent: "Original", expectedEditedAt: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "me" } } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(requireMessageAccess).mockResolvedValue(undefined);
  query.read.mockResolvedValue([{ userId: "me", content: "Original", status: "sent", deletedAt: null }]);
  query.returning.mockResolvedValue([{ id, content: "Corrected", editedAt: new Date("2026-10-20T12:00:00Z") }]);
});
describe("editing sent message text", () => {
  it("returns canonical text and the edit timestamp", async () => {
    expect(await editMessage(input)).toEqual({ ok: true, data: { id, content: "Corrected", editedAt: "2026-10-20T12:00:00.000Z" } });
    expect(requireMessageAccess).toHaveBeenCalledWith(id, "me");
  });
  it.each([{ userId: "another-person" }, { deletedAt: new Date() }, { status: "uploading" }, { content: null }])("refuses a message that cannot be edited: %j", async override => {
    query.read.mockResolvedValue([{ userId: "me", content: "Original", status: "sent", deletedAt: null, ...override }]);
    expect(await editMessage(input)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(query.update).not.toHaveBeenCalled();
  });
  it("enforces conversation access before reading message text", async () => {
    vi.mocked(requireMessageAccess).mockRejectedValue(new Error("Message not found."));
    await expect(editMessage(input)).rejects.toThrow("Message not found.");
    expect(query.read).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  });
  it.each(["", "   ", "x".repeat(20001)])("rejects invalid text before writing", async content => {
    expect(await editMessage({ ...input, content })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(query.update).not.toHaveBeenCalled();
  });
  it("reports a concurrent edit or deletion without pretending it saved", async () => {
    query.returning.mockResolvedValue([]);
    expect(await editMessage(input)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
});
