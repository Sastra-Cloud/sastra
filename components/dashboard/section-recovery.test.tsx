// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ManagerReviewItem } from "@/lib/dashboard/attention";
import { StreamedManagerReview } from "./streamed-sections";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  refresh.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container, { onCaughtError: () => {} });
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// A failed secondary read must not replace usable work or lose a draft, and
// retry must recover when the refreshed server supplies a successful result.
it("isolates a failed review and retries without remounting primary work", async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<ManagerReviewItem[]>((_, fail) => { reject = fail; });
  const render = (items: Promise<ManagerReviewItem[]>) => (
    <main>
      <input aria-label="Task draft" defaultValue="Unsaved work" />
      <StreamedManagerReview items={items} limit={3} />
    </main>
  );
  await act(() => root.render(render(pending)));
  const draft = container.querySelector("input")!;
  draft.value = "Keep this draft";
  expect(container.querySelector('[role="status"]')).not.toBeNull();

  await act(async () => { reject(new Error("Review unavailable")); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load items to review");
  expect(container.querySelector("input")).toBe(draft);
  expect(draft.value).toBe("Keep this draft");

  await act(() => container.querySelector("button")!.click());
  expect(refresh).toHaveBeenCalledOnce();
  const recovered: ManagerReviewItem = {
    id: "review", source: "dates", title: "Set the publishing date",
    detail: null, project: null, priority: "medium", href: "/projects",
    actionLabel: "Review project", createdAt: null,
  };
  await act(async () => root.render(render(Promise.resolve([recovered]))));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain(recovered.title);
  expect(container.querySelector("input")).toBe(draft);
  expect(draft.value).toBe("Keep this draft");
});
