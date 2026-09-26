import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PipelineView } from "./pipeline-view";
import type { PipelineData } from "@/lib/tasks/queries";
describe("pipeline task access", () => {
  it("exposes each populated cell as a keyboard link to the shared task editor", () => {
    const data = { units: [{ id:"unit",title:"Chapter one",number:1 }], phases:[{ id:"phase",name:"Editing" }], cells:[{ id:"task",unitId:"unit",phaseId:"phase",name:"Edit chapter",status:"review",assignedToName:null }] } as unknown as PipelineData;
    const html = renderToStaticMarkup(<PipelineView projectSlug="sample" data={data} />);
    expect(html).toContain('href="/projects/sample/tasks?task=task"');
    expect(html).toContain("Review");
    expect(html).toContain("aria-label=");
  });
});
