import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ scope: vi.fn(), record: vi.fn(), task: vi.fn(), role: vi.fn(), update: vi.fn(), insert: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth/project-access", () => ({ requireProjectCapability: state.scope, requireProjectRecord: state.record, requireTaskEdit: state.task }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: async () => ({ user: { id: "member", role: "member" } }), requireRole: state.role }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  update: state.update, insert: state.insert, delete: state.remove,
  select: () => { const query = { where: () => ({ limit: async () => [{ projectId: "other-project" }] }) }; return { from: () => ({ ...query, leftJoin: () => query }) }; },
} }));
import * as project from "@/lib/projects/actions";
import * as member from "@/lib/projects/member-actions";
import * as phase from "@/lib/projects/phase-actions";
import * as drive from "@/lib/projects/drive-actions";
import * as plan from "@/lib/projects/task-plan-actions";
import * as status from "@/lib/projects/status-actions";
import * as schedule from "@/lib/schedule/actions";
import * as episode from "@/lib/episodes/actions";
import * as task from "@/lib/tasks/actions";
import * as recurring from "@/lib/tasks/recurring-actions";
const id = "11111111-1111-4111-8111-111111111111";
const fd = () => { const data = new FormData(); for (const [key,value] of Object.entries({ id, title: "Title", status: "active", priority: "medium", confirmTitle: "Title" })) data.set(key,value); return data; };
beforeEach(() => {
  vi.clearAllMocks();
  for (const guard of [state.scope, state.record, state.task, state.role]) guard.mockRejectedValue(new Error("Permission denied"));
});

const workspaceOnly = new Set([
  "print planning flag", "project deletion", "workspace schedule", "global queue reorder",
  "episode status", "episode schedule", "episode title", "episode owner", "episode video",
  "episode assignee", "episode stage deadline", "episode workflow settings", "create episodes",
  "delete episode", "repair workflow", "bulk episodes",
]);

describe("project action authorization boundaries", () => {
  // Each entry is a separate callable server boundary: bypassing any one could
  // let a delegated member change another project's work or gain global access.
  it.each([
    ["project details", () => project.updateProject({}, fd())],
    ["project title", () => project.updateProjectTitle(id, "Title")],
    ["languages", () => project.updateProjectLanguages(id, { sourceLanguage: "English", targetLanguage: "French", targetLanguageTitle: "Title" })],
    ["project status", () => project.updateProjectStatus(id, "active")],
    ["print planning flag", () => project.updateProjectPrintFunding(id, "not_assessed")],
    ["project type", () => project.updateProjectKind(id, "book")],
    ["video workflow", () => project.updateVideoProductionMode(id, "translation")],
    ["project completion", () => project.completeProject(id)],
    ["project deletion", () => project.deleteProject({}, fd())],
    ["add member", () => member.addProjectMember(id, "member", id)],
    ["remove member", () => member.removeProjectMember(id)],
    ["stage dates", () => phase.updatePhaseDates(id, { dueDate: "2026-11-01" })],
    ["stage cascade", () => phase.shiftPhase(id, 1, true)],
    ["link folder", () => drive.setProjectDriveFolder(id, {folderId:"folder",name:"Folder",url:"https://drive.example.test/folder"})],
    ["unlink folder", () => drive.clearProjectDriveFolder(id)],
    ["generate plan", () => plan.generateProjectPlan(id, { kind: "book", detail: "standard" })],
    ["extract chapters", () => plan.extractChaptersFromDocument(id)],
    ["commit plan", () => plan.commitProjectPlan(id, { projectTitle: "Title", suggestedUnits: [], suggestedRoles: [], phases: [] }, { kind: "book", chapters: [], coordinators: {} })],
    ["project update", () => status.postProjectUpdate(id, "project", "Update")],
    ["review update", () => status.markProjectUpdateRecommendationsReviewed(id, "project")],
    ["project schedule", () => schedule.updateProjectSchedule(id, { startDate: "2026-11-01" })],
    ["project due date", () => schedule.setProjectDueDate(id, "2026-11-01")],
    ["workspace schedule", () => schedule.bulkRescheduleProjects([{ id, startDate: "2026-11-01" }])],
    ["episode status", () => episode.setEpisodeStatus(id, "scheduled")],
    ["episode schedule", () => episode.setEpisodeSchedule(id, "2026-11-01")],
    ["episode title", () => episode.renameEpisode(id, "Title")],
    ["episode owner", () => episode.setEpisodeOwner(id, "member")],
    ["episode video", () => episode.setEpisodeVideoRequirement(id, true)],
    ["episode assignee", () => episode.setEpisodeStageAssignee(id, "master_audio", "member")],
    ["episode stage deadline", () => episode.setEpisodeStageDueDate(id, "2026-11-01")],
    ["episode workflow settings", () => episode.updatePodcastWorkflowSettings(id, { videoRequired: true, stages: [] })],
    ["create episodes", () => episode.bulkCreateEpisodes(id, { count: 1 })],
    ["delete episode", () => episode.deleteEpisode(id)],
    ["repair workflow", () => episode.repairPodcastWorkflows(id)],
    ["bulk episodes", () => episode.bulkUpdateEpisodes(id, [id], { kind: "owner", ownerId: "member" })],
    ["create task for another teammate", () => { const data = new FormData(); data.set("title", "Title"); data.set("projectId", id); data.set("assignedTo", "someone"); return task.createTask({}, data); }],
    ["create recurring work for another teammate", () => recurring.createRecurringTask({ title: "Title", projectId: id, assigneeId: "someone", frequency: "monthly", anchorDate: "2026-11-01" })],
    ["edit recurring work", () => recurring.updateRecurringTask(id, { title: "Title", priority: "medium", frequency: "monthly", anchorDate: "2026-11-01" })],
    ["pause recurring work", () => recurring.setRecurringTaskActive(id, false)],
    ["delete recurring work", () => recurring.deleteRecurringTask(id)],
    ["task assignee", () => task.assignTask(id, "member")],
    ["task selection", () => task.setTaskNextUp(id, true)],
    ["global queue reorder", () => task.reorderUserTasks("member", [id], 0)],
    ["task status", () => task.updateTaskStatus(id, "done")],
    ["task fields", () => task.updateTaskFields(id, { title: "Title" })],
    ["task deletion", () => task.deleteTask(id)],
    ["task dependencies", () => task.setTaskDependencies(id, [])],
    ["task move", () => task.moveTaskToProject(id, { projectId: id })],
  ] as const)("denies unauthorized %s before writing", async (name, run) => {
    if (workspaceOnly.has(name)) {
      // An assigned project manager passes project guards, but must still fail
      // the workspace boundary for publishing, finance, and workspace actions.
      const assignedManager = { user: { id: "member", role: "member" }, projectId: id };
      state.scope.mockResolvedValue(assignedManager);
      state.record.mockResolvedValue(assignedManager);
      state.task.mockResolvedValue({ ...assignedManager, task: { projectId: id, assignedTo: "someone", createdBy: "manager" } });
    }
    await expect(run()).rejects.toThrow("Permission denied");
    if (workspaceOnly.has(name)) expect(state.role).toHaveBeenCalledWith("manager");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });
});
