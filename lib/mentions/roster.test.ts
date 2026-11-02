import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";

// Execute the real Drizzle roster predicates (including subqueries) against a
// small SQL fixture. No production Postgres-specific syntax is involved here.
const state = vi.hoisted(() => ({ db: null as unknown, actor: { id: "coordinator", role: "member" }, insert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  select: (...args: unknown[]) => (state.db as { select: (...args: unknown[]) => unknown }).select(...args),
  insert: state.insert,
} }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: async () => ({ user: state.actor }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revalidatePath } from "next/cache";
import { listProjectMentionTargets, listMentionTargetsByIds } from "./roster";
import { addProjectMember } from "@/lib/projects/member-actions";
import { hasProjectCapability } from "@/lib/auth/project-access";

let sql: DatabaseSync;
beforeEach(() => {
  vi.clearAllMocks();
  sql = new DatabaseSync(":memory:");
  sql.exec(`
    create table "user"(id text primary key,name text,email text,image text,role text,is_bot integer,is_active integer);
    create table project_members(id text,project_id text,user_id text,project_role_id text);
    create table project_managers(id text,project_id text,user_id text);
    create table projects(id text,slug text);
    insert into projects values ('assigned','assigned-project'),('other','other-project');
    insert into "user" values
      ('coordinator','Assigned Coordinator','coordinator@example.test',null,'member',0,1),
      ('workspace-manager','Workspace Manager','manager@example.test',null,'manager',0,1),
      ('other-coordinator','Other Coordinator','other@example.test',null,'member',0,1),
      ('inactive','Inactive Coordinator','inactive@example.test',null,'member',0,0),
      ('bot','Bot','bot@example.test',null,'member',1,1),
      ('teammate','Project Teammate','teammate@example.test',null,'member',0,1);
    insert into project_managers values ('grant','assigned','coordinator'),('other-grant','other','other-coordinator'),('inactive-grant','assigned','inactive'),('bot-grant','assigned','bot');
    insert into project_members values ('other-member','other','teammate','role');
  `);
  state.db = drizzle(async (query, params) => ({
    rows: sql.prepare(query.replace(/\$\d+/g, "?")).all(...params.map(value => typeof value === "boolean" ? Number(value) : value)).map(Object.values),
  }));
  state.actor = { id: "coordinator", role: "member" };
  state.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [{ id: "membership" }] }) }) });
});
afterEach(() => sql.close());

it("includes scoped managers without production roles, excludes other projects/inactive accounts, and honors revocation", async () => {
  expect((await listProjectMentionTargets("assigned")).map(person => person.id)).toEqual(["coordinator", "workspace-manager"]);
  sql.exec("insert into project_members values ('extra-role','assigned','coordinator','role')");
  expect((await listProjectMentionTargets("assigned")).filter(person => person.id === "coordinator")).toHaveLength(1);
  sql.exec("delete from project_members where id='extra-role'; delete from project_managers where id='grant'");
  expect((await listProjectMentionTargets("assigned")).map(person => person.id)).toEqual(["workspace-manager"]);
  expect((await listMentionTargetsByIds(["teammate"])).map(person => person.id)).toEqual(["teammate"]);
});

it("lets a scoped member add project members and manage tasks only on their assigned project, then refreshes chat rosters", async () => {
  await expect(addProjectMember("assigned", "teammate", "role")).resolves.toEqual({ id: "membership" });
  expect(state.insert).toHaveBeenCalledOnce();
  expect(await hasProjectCapability(state.actor, "assigned", "tasks.manage")).toBe(true);
  expect(await hasProjectCapability(state.actor, "other", "tasks.manage")).toBe(false);
  expect(revalidatePath).toHaveBeenCalledWith("/projects/assigned-project", "layout");
  expect(revalidatePath).toHaveBeenCalledWith("/chat", "layout");
  state.insert.mockClear();
  await expect(addProjectMember("other", "teammate", "role")).rejects.toThrow("permission");
  expect(state.insert).not.toHaveBeenCalled();
});
