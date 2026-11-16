import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/pg-proxy";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Execute the real membership predicates and mutations. This protects against
// chat history/file leaks after removal and against missing role-free members.
const state = vi.hoisted(() => ({ db: null as unknown, actor: { id: "admin", role: "admin" } }));
vi.mock("@/lib/db", () => ({ db: new Proxy({}, { get: (_, key) => {
  const value = (state.db as Record<string | symbol, unknown>)[key];
  return typeof value === "function" ? value.bind(state.db) : value;
} }) }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: async () => ({ user: state.actor }),
  requireRole: async (min: string) => {
    if (min === "admin" && state.actor.role !== "admin") throw new Error("Admin required");
    return { user: state.actor };
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn() }));

import { canAccessChannel, canAccessFile, canAccessMessage } from "@/lib/chat/access";
import { listProjectMentionTargets } from "@/lib/mentions/roster";
import { addProjectPerson, applyDefaultProjectPeople, previewDefaultProjectPeople, removeProjectPerson, saveDefaultProjectPeople } from "./people-actions";
import { addDefaultProjectPeople } from "./people";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
let sql: DatabaseSync;
beforeEach(() => {
  state.actor = { id: "admin", role: "admin" };
  sql = new DatabaseSync(":memory:");
  sql.function("gen_random_uuid", () => crypto.randomUUID());
  sql.function("now", () => new Date().toISOString());
  sql.exec(`
    create table "user"(id text primary key,name text,email text,image text,role text,is_bot integer,is_active integer);
    create table projects(id text primary key,slug text);
    create table project_people(id text,project_id text,user_id text,added_by text,created_at text,unique(project_id,user_id));
    create table default_project_people(user_id text primary key);
    create table project_members(id text,project_id text,user_id text,project_role_id text);
    create table project_managers(id text,project_id text,user_id text);
    create table chat_channels(id text,project_id text,kind text);
    create table chat_channel_members(id text,channel_id text,user_id text);
    create table chat_messages(id text,channel_id text);
    create table files(id text,purpose text,uploaded_by text);
    create table file_attachments(id text,file_id text,target_type text,target_id text);
    create table tasks(id text,project_id text,assigned_to text,created_by text);
    insert into projects values ('${PROJECT}','one'),('${OTHER}','other');
    insert into "user" values
      ('admin','Admin','admin@example.test',null,'admin',0,1),
      ('member','Member','member@example.test',null,'member',0,1),
      ('outsider','Outsider','outside@example.test',null,'member',0,1),
      ('manager','Project Manager','manager@example.test',null,'member',0,1),
      ('workspace-manager','Workspace Manager','global@example.test',null,'manager',0,1),
      ('inactive','Inactive','inactive@example.test',null,'member',0,0),
      ('bot','Bot','bot@example.test',null,'member',1,1);
    insert into project_managers values ('grant','${PROJECT}','manager');
    insert into chat_channels values ('project','${PROJECT}','project'),('other','${OTHER}','project'),('general',null,'general'),('private',null,'custom');
    insert into chat_messages values ('message','project');
    insert into files values ('file','workspace_attachment','member');
    insert into file_attachments values ('attachment','file','message','message'),('shared','file','project','${PROJECT}');
  `);
  const proxy = drizzle(async (query, params) => ({ rows: sql.prepare(query.replace(/\$\d+/g, "?").replace(/\bdefault\b/g, "null"))
    .all(...params.map(value => typeof value === "boolean" ? Number(value) : value)).map(row => Object.entries(row).map(([key, value]) => key === "is_active" || key === "is_bot" ? Boolean(value) : value)) }));
  state.db = new Proxy(proxy, { get: (target, key) => key === "transaction" ? async (run: (tx: unknown) => Promise<unknown>) => {
    sql.exec("begin");
    try { const result = await run(state.db); sql.exec("commit"); return result; }
    catch (error) { sql.exec("rollback"); throw error; }
  } : Reflect.get(target, key) });
});
afterEach(() => sql.close());

it("grants role-free people chat, message, file and mention access, then revokes all of it on removal", async () => {
  expect(await canAccessChannel("project", "member")).toBe(false);
  expect(await canAccessFile("file", "member")).toBe(false);
  await addProjectPerson(PROJECT, "member");
  expect(sql.prepare("select count(*) as n from project_members").get()?.n).toBe(0);
  expect(await canAccessChannel("project", "member")).toBe(true);
  expect(await canAccessMessage("message", "member")).toBe(true);
  expect(await canAccessFile("file", "member")).toBe(true);
  expect((await listProjectMentionTargets(PROJECT)).map(person => person.id)).toContain("member");
  sql.exec(`insert into project_members values ('work-role','${PROJECT}','member','editor')`);
  await removeProjectPerson(PROJECT, "member");
  expect(sql.prepare("select count(*) as n from project_members").get()?.n).toBe(0);
  expect(await canAccessChannel("project", "member")).toBe(false);
  expect(await canAccessMessage("message", "member")).toBe(false);
  expect(await canAccessFile("file", "member")).toBe(false);
  expect((await listProjectMentionTargets(PROJECT)).map(person => person.id)).not.toContain("member");
});

it("allows admin oversight and scoped managers while rejecting other projects, unrelated managers, inactive people and bots", async () => {
  expect(await canAccessChannel("project", "admin")).toBe(true);
  expect(await canAccessChannel("project", "manager")).toBe(true);
  expect(await canAccessChannel("other", "manager")).toBe(false);
  expect(await canAccessChannel("project", "workspace-manager")).toBe(false);
  expect(await canAccessChannel("general", "outsider")).toBe(true);
  expect(await canAccessChannel("private", "admin")).toBe(false);
  sql.exec(`insert into project_people(project_id,user_id) values ('${PROJECT}','inactive'),('${PROJECT}','bot')`);
  expect(await canAccessChannel("project", "inactive")).toBe(false);
  expect(await canAccessChannel("project", "bot")).toBe(false);
  state.actor = { id: "manager", role: "member" };
  await addProjectPerson(PROJECT, "member");
  await expect(addProjectPerson(OTHER, "outsider")).rejects.toThrow("permission");
  await expect(removeProjectPerson(PROJECT, "manager")).rejects.toThrow("management access first");
  state.actor = { id: "member", role: "member" };
  await expect(addProjectPerson(PROJECT, "outsider")).rejects.toThrow("permission");
  await expect(removeProjectPerson(PROJECT, "manager")).rejects.toThrow("permission");
  await expect(saveDefaultProjectPeople(["member"])).rejects.toThrow("Admin required");
  await expect(applyDefaultProjectPeople("anything")).rejects.toThrow("Admin required");
});

it("copies saved defaults into new projects, applies reviewed defaults idempotently, and rejects changed or inactive selections", async () => {
  await saveDefaultProjectPeople(["member", "member"]);
  const preview = await previewDefaultProjectPeople();
  expect(preview.people.map(person => person.id)).toEqual(["member"]);
  await addDefaultProjectPeople(state.db as Parameters<typeof addDefaultProjectPeople>[0], PROJECT, "admin");
  expect(await canAccessChannel("project", "member")).toBe(true);
  expect(await canAccessChannel("other", "member")).toBe(false);
  await expect(applyDefaultProjectPeople(preview.fingerprint)).resolves.toEqual({ added: 1 });
  await expect(applyDefaultProjectPeople(preview.fingerprint)).resolves.toEqual({ added: 0 });
  expect(await canAccessChannel("other", "member")).toBe(true);
  expect(await canAccessChannel("project", "outsider")).toBe(false);
  await saveDefaultProjectPeople(["outsider"]);
  await expect(applyDefaultProjectPeople(preview.fingerprint)).rejects.toThrow("changed");
  expect(await canAccessChannel("project", "outsider")).toBe(false);
  await expect(saveDefaultProjectPeople(["inactive"])).rejects.toThrow("no longer active");
  expect((await previewDefaultProjectPeople()).people.map(person => person.id)).toEqual(["outsider"]);
  // Changing defaults cannot revoke existing project membership.
  expect(await canAccessChannel("project", "member")).toBe(true);
});
