// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), pin: vi.fn(), complete: vi.fn(), error: vi.fn(), success: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/book/budget", useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }) }));
vi.mock("@/lib/tasks/pin-actions", () => ({ getTaskPinSnapshot: mocks.snapshot, setTaskPinned: mocks.pin }));
vi.mock("@/lib/tasks/actions", () => ({ updateTaskStatus: mocks.complete }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));

import type { MyTaskRow } from "@/lib/tasks/queries";
import { PinnedTasksProvider, PinnedTasksWorkspace, PinnedTasksToggle, usePinnedTasks } from "./pinned-tasks-provider";
import { PinnedTasksPanel } from "./pinned-tasks-panel";

const rows = ["first", "second"].map(id => ({ id, title: `${id} proposal for partner`, projectTitle: `Book ${id}`, projectSlug: id, assignedTo: "me", status: "todo" } as MyTaskRow));
let container: HTMLDivElement;
let root: Root;
let server: { tasks: MyTaskRow[]; pinnedIds: string[] };
let resize: (width: number) => void;
function Workspace() {
  const panel = usePinnedTasks();
  return <PinnedTasksWorkspace><PinnedTasksToggle /><input aria-label="Proposal draft" defaultValue="Keep my draft" />{panel?.docked ? <PinnedTasksPanel /> : null}</PinnedTasksWorkspace>;
}
async function mount() {
  await act(() => root.render(<PinnedTasksProvider userId="me"><Workspace /></PinnedTasksProvider>));
  await act(() => new Promise(resolve => setTimeout(resolve, 10)));
}
const button = (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const pinnedText = () => container.querySelector('ul[aria-label="Your pinned tasks"]')?.textContent ?? "";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: (entries: unknown[]) => void) { resize = width => callback([{ contentRect: { width } }]); }
    observe() { resize(1200); }
    disconnect() {}
  });
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  window.localStorage.setItem("sastra:task-panel:v1:me", "open");
  server = { tasks: rows, pinnedIds: ["first", "second"] };
  mocks.snapshot.mockImplementation(async () => ({ tasks: [...server.tasks], pinnedIds: [...server.pinnedIds] }));
  mocks.pin.mockImplementation(async (id: string, pinned: boolean) => {
    server.pinnedIds = pinned ? [...server.pinnedIds, id] : server.pinnedIds.filter(value => value !== id);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

// A failed completion must not lose the reference, resurrect another unpinned
// task, or replace the proposal being edited beside it.
it("removes completed work immediately, then rolls back only the failed completion during another successful unpin", async () => {
  let fail!: (error: Error) => void;
  mocks.complete.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  await mount();
  await act(() => button(`Complete ${rows[0].title}`).click());
  expect(pinnedText()).not.toContain(rows[0].title);
  await act(() => button(`Unpin ${rows[1].title}`).click());
  expect(pinnedText()).not.toContain(rows[1].title);
  await act(() => fail(new Error("Completion failed")));
  expect(pinnedText()).toContain(rows[0].title);
  expect(pinnedText()).not.toContain(rows[1].title);
  expect(container.querySelector<HTMLInputElement>("input[aria-label='Proposal draft']")?.value).toBe("Keep my draft");
  expect(mocks.error).toHaveBeenCalled();
  const undo = mocks.success.mock.calls.find(([message]) => message === "Task unpinned")?.[1].action.onClick;
  await act(() => undo());
  expect(pinnedText()).toContain(rows[1].title);
  expect(mocks.pin).toHaveBeenLastCalledWith("second", true);
});

it("restores failed pin changes and keeps the draft and personal selection through close and responsive collapse", async () => {
  let fail!: (error: Error) => void;
  mocks.pin.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  await mount();
  await act(() => button(`Unpin ${rows[0].title}`).click());
  expect(pinnedText()).not.toContain(rows[0].title);
  await act(() => fail(new Error("Pin save failed")));
  expect(pinnedText()).toContain(rows[0].title);
  const draft = container.querySelector<HTMLInputElement>("input[aria-label='Proposal draft']")!;
  draft.value = "Edited proposal";
  await act(() => resize(800));
  expect(container.querySelector("aside")).toBeNull();
  await act(() => resize(1200));
  expect(pinnedText()).toContain(rows[0].title);
  await act(() => button("Close pinned tasks").click());
  expect(container.querySelector("aside")).toBeNull();
  await act(() => button("Open pinned tasks").click());
  expect(container.querySelector<HTMLInputElement>("input[aria-label='Proposal draft']")).toBe(draft);
  expect(draft.value).toBe("Edited proposal");
});

it("keeps approval work behind its review workflow while allowing the reference to be unpinned", async () => {
  server = { tasks: [{ ...rows[0], approvalAssignmentId: "approval" }], pinnedIds: ["first"] };
  await mount();
  expect(button(`Complete ${rows[0].title}`)).toBeNull();
  expect(container.querySelector('a[href="/tasks?task=first"]')?.textContent).toBe("Open task to review");
  await act(() => button(`Unpin ${rows[0].title}`).click());
  expect(pinnedText()).not.toContain(rows[0].title);
  expect(mocks.complete).not.toHaveBeenCalled();
});
