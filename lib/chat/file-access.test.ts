import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mocks.execute) };
});
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn() }));

import { canAccessFile } from "./access";

beforeEach(() => vi.resetAllMocks());

function givenFile(
  attachments: Array<[string, string | null, string | null, ...(string | null)[]]>,
  role = "member",
  active = true,
  purpose = "workspace_attachment"
) {
  mocks.execute
    .mockResolvedValueOnce({ rows: [[purpose, "viewer", role, active]] })
    .mockResolvedValueOnce({ rows: attachments.map((row) => [...row, ...Array(7 - row.length).fill(null)]) });
}

describe("file attachment authorization", () => {
  it.each(["email_message", "agreement_group"])(
    "denies a member (including a demoted uploader) a file shared only through %s",
    async (target) => {
      givenFile([[target, null, null]]);
      expect(await canAccessFile("private-file", "viewer")).toBe(false);
    }
  );

  it.each(["manager", "admin", "super_admin"])(
    "allows an active %s to read correspondence and agreement source files",
    async (role) => {
      givenFile([["email_message", null, null], ["agreement_group", null, null]], role);
      expect(await canAccessFile("private-file", "viewer")).toBe(true);
    }
  );

  it("does not let email attachment rows bypass private chat membership", async () => {
    givenFile([["email_message", null, null], ["message", "direct", null]]);
    expect(await canAccessFile("private-file", "viewer")).toBe(false);
  });

  it.each([
    ["project", null, null],
    ["message", "project", null],
    ["message", "direct", "viewer"],
  ] as Array<[string, string | null, string | null]>)(
    "allows a separate authorized %s attachment to share the same file",
    async (target, kind, member) => {
      givenFile([["email_message", null, null], [target, kind, member]]);
      expect(await canAccessFile("shared-file", "viewer")).toBe(true);
    }
  );

  it("preserves private-chat restrictions even when the file also has a shared attachment", async () => {
    givenFile([["message", "custom", null], ["project", null, null]], "manager");
    expect(await canAccessFile("private-file", "viewer")).toBe(false);
  });

  it("applies standalone-task visibility to direct file downloads", async () => {
    givenFile([["task", null, null, "task", null, "other", "other"]]);
    expect(await canAccessFile("private-file", "viewer")).toBe(false);
    givenFile([["task", null, null, "task", null, "viewer", "other"]]);
    expect(await canAccessFile("own-file", "viewer")).toBe(true);
    givenFile([["task", null, null, "task", "project", "other", "other"]]);
    expect(await canAccessFile("project-file", "viewer")).toBe(true);
    givenFile([["task", null, null]]);
    expect(await canAccessFile("deleted-task-file", "viewer")).toBe(false);
  });

  it("does not treat a deleted chat target as a shared attachment", async () => {
    givenFile([["message", null, null]]);
    expect(await canAccessFile("private-file", "viewer")).toBe(false);
  });

  it("rejects inactive uploaders before considering shared attachments", async () => {
    givenFile([["project", null, null]], "admin", false);
    expect(await canAccessFile("shared-file", "viewer")).toBe(false);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("keeps donation-purpose files admin-only even with a shared attachment", async () => {
    givenFile([["project", null, null]], "manager", true, "donation_import");
    expect(await canAccessFile("donor-file", "viewer")).toBe(false);
  });

  it("preserves access to the uploader's unattached file without sharing it with other managers", async () => {
    givenFile([], "manager");
    expect(await canAccessFile("upload", "viewer")).toBe(true);
    givenFile([], "manager");
    expect(await canAccessFile("upload", "other-manager")).toBe(false);
  });
});
