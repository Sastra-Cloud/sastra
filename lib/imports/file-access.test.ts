import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { files } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
vi.mock("@/lib/chat/access", () => ({ canAccessFile: mocks.access }));

import { getAccessibleExtractionFile, getEmailExtractionFile } from "./file-access";

const file = {
  id: "file", r2Key: "test/document", originalName: "agreement.pdf",
  mimeType: "application/pdf", sizeBytes: 10, status: "ready",
  purpose: "workspace_attachment", uploadedBy: "uploader", createdAt: null,
};
const fileValues = (overrides: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = { ...file, ...overrides };
  return Object.keys(getTableColumns(files)).map((key) => row[key]);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(true);
});

describe("extraction file authorization", () => {
  it.each([
    { role: "manager", active: true, purpose: "donation_import", status: "ready" },
    { role: "admin", active: true, purpose: "donation_import", status: "ready" },
    { role: "manager", active: true, purpose: "workspace_attachment", status: "pending" },
    { role: "manager", active: false, purpose: "workspace_attachment", status: "ready" },
    { role: "member", active: true, purpose: "workspace_attachment", status: "ready" },
  ])("rejects ineligible source or creator: $role / $active / $purpose / $status", async (input) => {
    mocks.execute.mockResolvedValueOnce({ rows: [[...fileValues(input), input.role, input.active]] });
    expect(await getAccessibleExtractionFile("file", "actor")).toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("checks current file access even for an active manager, and permits a shared file", async () => {
    mocks.execute.mockResolvedValue({ rows: [[...fileValues(), "manager", true]] });
    mocks.access.mockResolvedValueOnce(false);
    expect(await getAccessibleExtractionFile("file", "actor")).toBeNull();
    expect(mocks.access).toHaveBeenCalledWith("file", "actor");
    expect(await getAccessibleExtractionFile("file", "actor")).toMatchObject({ id: "file" });
  });

  it("rejects a deleted creator or missing file", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await getAccessibleExtractionFile("file", "deleted-user")).toBeNull();
  });

  it("binds system intake to a ready email attachment on the exact recorded thread", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [fileValues()] });
    expect(await getEmailExtractionFile("file", "message", "thread")).toMatchObject({ id: "file" });
    const [query, params] = mocks.execute.mock.calls[0];
    // The proxy checks the query boundary, not a live database or email provider.
    expect(query).toContain('inner join "file_attachments"');
    expect(query).toContain('inner join "email_messages"');
    expect(params).toEqual(["email_message", "message", "thread", "file", "ready", "workspace_attachment", "email_ingest", 1]);
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await getEmailExtractionFile("file", "different-message", "thread")).toBeNull();
  });
});
