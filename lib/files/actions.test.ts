import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  deleteObject: vi.fn(),
  messageWhere: vi.fn(),
  membershipJoin: vi.fn(),
  targetType: "message",
  grants: new Set<string>(),
  taskProjectId: "assigned",
  memberUserId: null as string | null,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: mocks.requireUser,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, update: mocks.update, delete: mocks.delete },
}));
vi.mock("@/lib/r2", () => ({ deleteObject: mocks.deleteObject }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn() }));

// Keep the real message access guard: a custom-channel row with no matching
// membership must deny the action even when the attachment ID is already known.
import { chatMessages, fileAttachments, files, projectManagers, tasks } from "@/lib/db/schema";
import { removeAttachment, updateAttachmentNotes } from "./actions";

const USER_ID = "teammate-1";
const ATTACHMENT_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";
const FILE_ID = "00000000-0000-4000-8000-000000000003";
const session = { user: { id: USER_ID, role: "member", isActive: true } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.targetType = "message";
  mocks.grants = new Set();
  mocks.taskProjectId = "assigned";
  mocks.memberUserId = null;
  mocks.requireUser.mockResolvedValue(session);
  mocks.requireRole.mockRejectedValue(new Error("NEXT_REDIRECT"));
  mocks.select.mockImplementation((fields: Record<string, unknown>) => ({
    from: (table: unknown) => {
      let rows: Record<string, unknown>[];
      if (table === chatMessages) {
        rows = [{ kind: "custom", memberUserId: mocks.memberUserId }];
      } else if (table === fileAttachments) {
        rows = "targetType" in fields
          ? [{ targetType: mocks.targetType, targetId: TARGET_ID }]
          : []; // No remaining attachments after the authorized deletion.
      } else if (table === tasks) {
        rows = [{ projectId: mocks.taskProjectId, assignedTo: "other", createdBy: "other" }];
      } else if (table === projectManagers) {
        rows = [];
      } else {
        throw new Error("Unexpected attachment access query");
      }
      const query = {
        innerJoin: () => query,
        leftJoin: (_table: unknown, condition: SQL) => {
          mocks.membershipJoin(condition);
          return query;
        },
        where: (condition: SQL) => {
          if (table === chatMessages) mocks.messageWhere(condition);
          if (table === projectManagers) rows = mocks.grants.has(new PgDialect().sqlToQuery(condition).params.join(":")) ? [{ id: "grant" }] : [];
          return query;
        },
        limit: async () => rows.map((row) => Object.fromEntries(
          Object.keys(fields).map((key) => [key, row[key]])
        )),
      };
      return query;
    },
  }));
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockImplementation((values: { notes: string | null }) => ({
    where: () => ({
      returning: async () => [{ attachmentId: ATTACHMENT_ID, notes: values.notes }],
    }),
  }));
  mocks.delete.mockImplementation((table: unknown) => ({
    where: () => ({
      returning: async () => table === fileAttachments
        ? [{ fileId: FILE_ID }]
        : [{ r2Key: "fixture/private-file" }],
    }),
  }));
  mocks.deleteObject.mockResolvedValue(undefined);
});

function expectMessageAccessChecked() {
  const dialect = new PgDialect();
  expect(mocks.messageWhere).toHaveBeenCalledOnce();
  expect(dialect.sqlToQuery(mocks.messageWhere.mock.calls[0][0]).params).toEqual([TARGET_ID]);
  expect(mocks.membershipJoin).toHaveBeenCalledOnce();
  expect(dialect.sqlToQuery(mocks.membershipJoin.mock.calls[0][0]).params).toEqual([USER_ID]);
}

function expectNoWrites() {
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.deleteObject).not.toHaveBeenCalled();
}

const mutations = [
  {
    name: "updateAttachmentNotes",
    run: () => updateAttachmentNotes(ATTACHMENT_ID, "  Reviewed  "),
    expectSuccess: (result: unknown) => {
      expect(result).toEqual({ attachmentId: ATTACHMENT_ID, notes: "Reviewed" });
      expect(mocks.update).toHaveBeenCalledWith(fileAttachments);
      expect(mocks.set).toHaveBeenCalledWith({ notes: "Reviewed" });
      expect(mocks.deleteObject).not.toHaveBeenCalled();
    },
  },
  {
    name: "removeAttachment",
    run: () => removeAttachment(ATTACHMENT_ID),
    expectSuccess: () => {
      expect(mocks.delete).toHaveBeenNthCalledWith(1, fileAttachments);
      expect(mocks.delete).toHaveBeenNthCalledWith(2, files);
      expect(mocks.deleteObject).toHaveBeenCalledExactlyOnceWith("fixture/private-file");
    },
  },
];

describe.each(mutations)("$name authorization", ({ run, expectSuccess }) => {
  it("denies a removed custom-channel member before any database or object write", async () => {
    await expect(run()).rejects.toThrow("Attachment not found.");
    expectMessageAccessChecked();
    expectNoWrites();
  });

  it("allows a current channel member to mutate the attachment", async () => {
    mocks.memberUserId = USER_ID;
    const result = await run();
    expectMessageAccessChecked();
    expectSuccess(result);
  });

  it.each(["agreement_group", "rights_item", "budget_item", "print_payment"])("denies member mutations of %s attachments", async (targetType) => {
    mocks.targetType = targetType;
    await expect(run()).rejects.toThrow("Attachment not found.");
    expectNoWrites();
  });

  it.each(["task", "project"])("uses the stored %s target and current project grant", async (targetType) => {
    mocks.targetType = targetType;
    await expect(run()).rejects.toThrow("Attachment not found.");
    expectNoWrites();
    const projectId = targetType === "task" ? "assigned" : TARGET_ID;
    mocks.grants.add(`${projectId}:${USER_ID}`);
    expectSuccess(await run());
    vi.clearAllMocks();
    mocks.grants.clear();
    await expect(run()).rejects.toThrow("Attachment not found.");
    expectNoWrites();
  });

  it("preserves agreement mutations for managers", async () => {
    mocks.targetType = "agreement_group";
    mocks.requireUser.mockResolvedValue({ user: { ...session.user, role: "manager" } });
    const result = await run();
    expect(mocks.messageWhere).not.toHaveBeenCalled();
    expectSuccess(result);
  });
});
