import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { lectioUserLinks, projects, user } from "@/lib/db/schema";
import { can, canInProject } from "@/lib/auth/policy";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { assertVerifiedLectioActor } from "./identity";
import { IntegrationError, identifier, object, string } from "./protocol/contract";
import { rankProjectMatches } from "./protocol/project-matches";

/** Only projects the verified person can manage are exposed to the connected team. */
export async function projectMatches(tx: IntegrationTransaction, connection: LectioConnection, input: unknown) {
  const body = object(input), actorId = identifier(body.actorId);
  const sourceProjectId = typeof body.lectioProjectId === "string" ? identifier(body.lectioProjectId) : "";
  const [person] = await tx.select({ id: user.id, role: user.role, active: user.isActive, bot: user.isBot }).from(lectioUserLinks)
    .innerJoin(user, eq(user.id, lectioUserLinks.userId)).where(and(eq(lectioUserLinks.connectionId, connection.id), eq(lectioUserLinks.remoteUserId, actorId))).for("share", { of: user });
  if (!person?.active || person.bot) throw new IntegrationError("identity_required", "Link your existing accounts in Sastra Profile before checking its projects.", 403);
  await assertVerifiedLectioActor(tx, connection.origin, person.id, actorId);
  if (!can(person.role, "project.edit") && !canInProject(person, "project.edit", "scope", ["scope"])) throw new IntegrationError("forbidden", "Ask a Sastra project manager to review the connection.", 403);
  const rows = await tx.select({ id: projects.id, name: projects.title, slug: projects.slug, sourceLanguage: projects.sourceLanguage, targetLanguage: projects.targetLanguage }).from(projects)
    .where(and(or(isNull(projects.kind), inArray(projects.kind, ["book", "article"])),
      can(person.role, "project.edit") ? undefined : sql`exists(select 1 from project_managers where project_id=${projects.id} and user_id=${person.id})`,
      sql`not exists(select 1 from lectio_project_links where project_id=${projects.id} and (state in ('active','linking') or connection_id <> ${connection.id} or remote_project_id <> ${sourceProjectId}))`))
    .orderBy(sql`case when lower(${projects.title}) = lower(${String(body.name || "").slice(0, 200)}) then 0 else 1 end`, projects.title).limit(1000);
  return { projects: rankProjectMatches(rows.map(row => ({ ...row, sourceLanguage: row.sourceLanguage || "", targetLanguage: row.targetLanguage || "" })), {
    name: string(body.name, 200), sourceLanguage: string(body.sourceLanguage, 100), targetLanguage: string(body.targetLanguage, 100),
  }), truncated: rows.length === 1000 };
}
