import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Gantt } from "./gantt";
import { Timeline } from "./timeline";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("responsive timelines", () => {
  it("keeps the interactive chart inside a shrinkable scroll viewport", () => {
    const markup = renderToStaticMarkup(
      <Gantt
        phases={[]}
        tasks={[
          {
            id: "task-1",
            title: "Milestone",
            dueDate: "2026-08-01",
            phaseId: null,
            status: "todo",
            isMilestone: true,
          },
        ]}
        deps={[]}
        today="2026-07-20"
        canEdit
        tasksHref="/projects/example/tasks"
      />
    );

    expect(markup).toContain("max-w-full");
    expect(markup).toContain("grid-cols-[8.5rem_minmax(0,1fr)]");
    expect(markup).toContain("min-w-0 overflow-x-auto");
    expect(markup).toContain("pointer-coarse:min-h-11");
  });

  it("lets the portfolio timeline's chart track shrink on phones", () => {
    const markup = renderToStaticMarkup(
      <Timeline
        today="2026-07-20"
        rows={[
          {
            id: "project-1",
            label: "Example project",
            start: "2026-07-01",
            end: "2026-09-01",
          },
        ]}
      />
    );

    expect(markup).toContain("max-w-full");
    expect(markup).toContain("grid-cols-[7.5rem_minmax(0,1fr)]");
  });
});
