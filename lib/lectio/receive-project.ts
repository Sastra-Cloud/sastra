import "server-only";
import { and, eq } from "drizzle-orm";
import { lectioOperations, lectioProjectLinks, user } from "@/lib/db/schema";
import { createProjectInTransaction, createProjectSchema } from "@/lib/projects/create";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { slugify } from "@/lib/slug";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { IntegrationError, identifier, integer, object, parseSnapshot } from "./protocol/contract";
import { parseProfile } from "./protocol/profile";
import { applySnapshot } from "./projection";
import { resolveProfile } from "./profile";
import { auditLectio } from "./audit";

export async function receiveProject(tx: IntegrationTransaction, connection: LectioConnection, input: unknown) {
  const approval = connection.profile.connectionApproval as { actorId?: string } | undefined;
  const actorId = approval?.actorId ?? connection.pairedBy;
  if (!connection.autoCreate || !actorId) throw new IntegrationError("creation_not_approved", "Enable connected project creation in Sastra's Lectio settings first.", 403);
  const [actor] = await tx.select().from(user).where(eq(user.id, actorId)).for("share");
  if (!actor?.isActive || !["admin", "super_admin"].includes(actor.role)) throw new IntegrationError("approval_required", "A current workspace administrator must review this connection.", 403);
  const body = object(input), snapshot = parseSnapshot(body.snapshot), projectKey = identifier(body.projectKey);
  if (snapshot.connectionId !== connection.id || snapshot.epoch !== connection.epoch || snapshot.generation !== 1) throw new IntegrationError("wrong_connection", "This creation request belongs to another connection.", 409);
  const [cancelled] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, connection.id), eq(lectioOperations.direction, "in"), eq(lectioOperations.operationId, `cancel-create-${projectKey}`)));
  if (cancelled) throw new IntegrationError("creation_cancelled", "This project was disconnected before creation completed.", 409);
  const [existing] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connection.id), eq(lectioProjectLinks.projectKey, projectKey)));
  if (existing) {
    if (!existing.projectId || existing.remoteProjectId !== snapshot.project.id || !["active", "linking"].includes(existing.state)) throw new IntegrationError("project_conflict", "This project identity has already been used or disconnected.", 409);
    return { remoteProjectId: existing.projectId, projectKey, generation: existing.generation, appliedVersion: existing.lastVersion, reviewRequired: existing.state === "linking" && !existing.stageMap.length };
  }
  const profileVersion = integer(body.profileVersion, 1);
  const [approved] = profileVersion !== Number(connection.profile.version) ? await tx.select().from(lectioOperations)
    .where(and(eq(lectioOperations.connectionId, connection.id), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, `profile-${profileVersion}`), eq(lectioOperations.kind, "profile"))) : [];
  const profile = parseProfile(profileVersion === Number(connection.profile.version) ? connection.profile : (approved?.payload.body as Record<string, unknown> | undefined)?.profile);
  const workspace = await getWorkspaceSettings();
  const data = createProjectSchema.parse({ title: snapshot.project.name, sourceLanguage: snapshot.project.sourceLanguage,
    targetLanguage: snapshot.project.targetLanguage, kind: profile.kind, planTemplateId: profile.planTemplateId });
  const project = await createProjectInTransaction(tx, { data, workspace, actorId: actor.id, slug: `${slugify(data.title)}-${projectKey}` });
  const reviewRequired = body.reviewBeforeLink === true;
  const mapping = reviewRequired ? { stageMap: [], handoffPhaseId: null, deliverFiles: profile.deliverFiles } : await resolveProfile(tx, profile, project.id, snapshot);
  await tx.insert(lectioProjectLinks).values({ connectionId: connection.id, projectId: project.id, remoteProjectId: snapshot.project.id, projectKey, ...mapping });
  if (!reviewRequired) await applySnapshot(tx, connection, snapshot);
  await auditLectio(tx, connection.id, actor.id, "connected_project_created", { projectId: project.id, remoteProjectId: snapshot.project.id, projectKey });
  return { remoteProjectId: project.id, projectKey, generation: 1, appliedVersion: reviewRequired ? 0 : snapshot.version, reviewRequired };
}
