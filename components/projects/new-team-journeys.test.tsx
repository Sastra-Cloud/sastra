import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: "member", projects: [] as { id: string }[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/projects/people-actions", () => ({ addProjectPerson: vi.fn(), removeProjectPerson: vi.fn() }));
vi.mock("@/lib/projects/member-actions", () => ({ addProjectMember: vi.fn(), removeProjectMember: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: async () => ({ user: { role: mocks.role } }) }));
vi.mock("@/lib/projects/queries", () => ({ listProjects: async () => mocks.projects }));
vi.mock("@/components/projects/projects-browser", () => ({ ProjectsBrowser: () => <div>Existing projects</div> }));
vi.mock("@/components/motion/reveal", () => ({ Reveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import ProjectsPage from "@/app/(app)/projects/page";
import { ProjectPeopleManager } from "./project-people-manager";
import { projectDraftFormData, type ProjectDraft } from "./project-draft";

describe("new publishing team journeys", () => {
  it.each(["member", "manager", "admin"])("matches project actions to %s permissions in empty and populated workspaces", async role => {
    mocks.role = role;
    for (const projects of [[], [{ id: "one" }]]) {
      mocks.projects = projects;
      const html = renderToStaticMarkup(await ProjectsPage());
      if (role === "member") { expect(html).not.toContain('href="/projects/new"'); expect(html).not.toContain('href="/agreements"'); }
      else expect(html).toContain('href="/projects/new"');
      if (projects.length) expect(html).toContain("Existing projects");
      else if (role === "member") expect(html).toContain("Ask a manager");
    }
  });
  it("keeps membership readable without offering member mutations", () => {
    const html = renderToStaticMarkup(<ProjectPeopleManager projectId="p" canEdit={false} people={[{ id:"u",name:"Sample teammate",image:null,admin:false,manager:false,roles:[{id:"m",roleId:"editor",label:"Editor"}] }]} candidates={[]} roles={[]} />);
    expect(html).toContain("Sample teammate"); expect(html).toContain("Editor");
    expect(html).not.toContain("Add people"); expect(html).not.toContain("Remove");
  });
  it("serializes the whole draft, including fields absent from the current wizard step", () => {
    const draft: ProjectDraft = { title:"Sample", description:"Goal", kind:"video_series", videoProductionMode:"translation", status:"active", priority:"high", printFundingStatus:"not_assessed", sourceLanguage:"Source", targetLanguage:"Target", startDate:"2026-09-01", dueDate:"2027-02-01", planTemplateId:"template", chapters:"One\nTwo" };
    expect(Object.fromEntries(projectDraftFormData(draft))).toEqual(draft);
  });
});
