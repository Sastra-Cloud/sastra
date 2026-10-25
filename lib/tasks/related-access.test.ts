import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  actor: { id: "member", role: "member", name: "Member" },
  task: { projectId: null as string | null, assignedTo: "other" as string | null, createdBy: "other" },
  grants: new Set<string>(),
  missing: false, reads: [] as unknown[], select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  comments: vi.fn(), time: vi.fn(), mentions: vi.fn(), start: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: {} } }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: async () => ({ user: state.actor }) }));
vi.mock("@/lib/db", () => ({ db: {
  select: state.select, insert: state.insert, update: state.update, delete: state.delete,
  transaction: async (run: (tx: unknown) => unknown) => run({ select: state.select, insert: state.insert, update: state.update, delete: state.delete }),
} }));
vi.mock("./queries", () => ({ getTaskComments: state.comments, getMyTasks: vi.fn() }));
vi.mock("./time-queries", () => ({ getTaskTimeEntries: state.time }));
vi.mock("./create", () => ({ revalidateForTask: state.revalidate }));
vi.mock("./time-service", () => ({ startTimerFor: state.start, stopTimerFor: vi.fn() }));
vi.mock("@/lib/mentions/notify", () => ({ notifyMentions: state.mentions }));
vi.mock("@/lib/mentions/roster", () => ({ listAllMentionTargets: async () => [], listProjectMentionTargets: async () => [] }));

import { projectManagers, taskComments, taskDriveFiles, tasks, timeEntries } from "@/lib/db/schema";
import { addTaskComment, deleteTaskComment, editTaskComment, listTaskComments } from "./comment-actions";
import { deleteTimeEntry, loadTaskTime, logTime, startTimer, updateTimeEntry } from "./time-actions";
import { addTaskDriveFile, clearTaskDriveFolder, getTaskDriveTarget, listTaskDriveFiles, removeTaskDriveFile, setTaskDriveFolder } from "./drive-actions";

const taskId = "11111111-1111-4111-8111-111111111111";
const file = { driveFileId: "drive-file", name: "Draft", url: "https://drive.google.com/file/d/test" };
const folder = { folderId: "folder", name: "Drafts", url: "https://drive.google.com/drive/folders/test" };
const readers = [
  ["comments", () => listTaskComments(taskId)],
  ["time entries", () => loadTaskTime(taskId)],
  ["Drive files", () => listTaskDriveFiles(taskId)],
  ["Drive folder", () => getTaskDriveTarget(taskId)],
] as const;
const collaboration = [
  ["add comment", () => addTaskComment(taskId, "Update for @teammate")],
  ["edit comment", () => editTaskComment("comment", "Revised note")],
  ["delete comment", () => deleteTaskComment("comment")],
  ["start timer", () => startTimer(taskId)],
  ["log time", () => logTime({ taskId, minutes: 20 })],
  ["edit time", () => updateTimeEntry("entry", { minutes: 25 })],
  ["delete time", () => deleteTimeEntry("entry")],
] as const;
const driveEdits = [
  ["attach file", () => addTaskDriveFile(taskId, file)],
  ["remove file", () => removeTaskDriveFile("file")],
  ["set folder", () => setTaskDriveFolder(taskId, folder)],
  ["clear folder", () => clearTaskDriveFolder(taskId)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = { id: "member", role: "member", name: "Member" };
  state.task = { projectId: null, assignedTo: "other", createdBy: "other" };
  state.missing = false;
  state.reads = [];
  state.grants = new Set();
  state.comments.mockResolvedValue([{ id: "comment", content: "Private comment" }]);
  state.time.mockResolvedValue({ entries: [{ id: "entry", note: "Private note" }], totalSeconds: 1200 });
  state.select.mockImplementation(() => ({ from: (table: unknown) => {
    state.reads.push(table);
    const rows = table === tasks ? (state.missing ? [] : [{ ...state.task, title: "Draft" }])
      : table === taskComments ? [{ userId: "member", taskId }]
        : table === timeEntries ? [{ userId: "member", taskId, startedAt: new Date("2026-10-01T10:00:00Z"), endedAt: new Date("2026-10-01T10:20:00Z"), durationSeconds: 1200 }]
          : table === taskDriveFiles ? [{ id: "file", taskId, ...file }] : [];
    const result = Object.assign(Promise.resolve(rows), { limit: () => result, for: () => result, orderBy: () => result });
    const from = {
      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => table === projectManagers
        ? { limit: async () => state.grants.has(new PgDialect().sqlToQuery(condition).params.join(":")) ? [{ id: "grant" }] : [] }
        : result,
      leftJoin: () => from,
    };
    return from;
  } }));
  const result = () => Object.assign(Promise.resolve([]), { returning: async () => [{ projectId: state.task.projectId, taskId }] });
  state.update.mockImplementation(() => ({ set: () => ({ where: result }) }));
  state.delete.mockImplementation(() => ({ where: result }));
  state.insert.mockImplementation(() => ({ values: (data: unknown) => Object.assign(Promise.resolve(), {
    returning: async () => [{ id: "comment", createdAt: new Date(), updatedAt: new Date(), ...(data as object) }],
    onConflictDoNothing: async () => undefined,
  }) }));
});

function expectNoWrites() {
  for (const effect of [state.insert, state.update, state.delete, state.start, state.mentions, state.revalidate]) expect(effect).not.toHaveBeenCalled();
}

describe("task details visibility", () => {
  it.each(readers)("denies a private task's %s before fetching its contents", async (_name, read) => {
    await expect(read()).rejects.toThrow(/access denied/i);
    expect(state.comments).not.toHaveBeenCalled();
    expect(state.time).not.toHaveBeenCalled();
    expect(state.reads).toEqual([tasks]);
  });

  it.each(["project", "assignee", "creator", "manager"])("preserves %s access to comments and time", async (access) => {
    if (access === "project") state.task.projectId = "project";
    if (access === "assignee") state.task.assignedTo = state.actor.id;
    if (access === "creator") state.task.createdBy = state.actor.id;
    if (access === "manager") state.actor.role = "manager";
    await expect(listTaskComments(taskId)).resolves.toEqual([{ id: "comment", content: "Private comment" }]);
    await expect(loadTaskTime(taskId)).resolves.toMatchObject({ totalSeconds: 1200 });
    await expect(listTaskDriveFiles(taskId)).resolves.toHaveLength(1);
    await expect(getTaskDriveTarget(taskId)).resolves.toEqual({ taskFolder: null, projectFolder: null });
  });

  it("does not treat a missing task as a readable standalone task", async () => {
    state.missing = true;
    await expect(listTaskComments(taskId)).rejects.toThrow(/access denied/i);
    expect(state.comments).not.toHaveBeenCalled();
  });
});

describe("task comments, time, and Drive mutations", () => {
  it.each(collaboration)("denies %s after a member loses private-task visibility", async (_name, write) => {
    await expect(write()).rejects.toThrow(/access denied/i);
    expectNoWrites();
  });

  it.each(collaboration)("preserves team collaboration on project tasks: %s", async (_name, write) => {
    state.task.projectId = "project";
    await write();
    expect(state.revalidate).toHaveBeenCalled();
  });

  it.each(driveEdits)("requires edit authority for %s even on a visible project task", async (_name, write) => {
    state.task.projectId = "project";
    await expect(write()).rejects.toThrow(/access denied/i);
    expectNoWrites();
  });

  it.each(driveEdits)("allows an assignee to %s", async (_name, write) => {
    state.task.assignedTo = state.actor.id;
    await write();
    expect(state.revalidate).toHaveBeenCalled();
  });

  it.each(driveEdits)("allows scoped managers to %s only while their task's grant is current", async (_name, write) => {
    state.task.projectId = "assigned";
    state.grants.add("assigned:member");
    await write();
    expect(state.revalidate).toHaveBeenCalled();
    vi.clearAllMocks();
    state.task.projectId = "other";
    await expect(write()).rejects.toThrow(/access denied/i);
    expectNoWrites();
    state.task.projectId = "assigned";
    state.grants.clear();
    await expect(write()).rejects.toThrow(/access denied/i);
    expectNoWrites();
  });
});
