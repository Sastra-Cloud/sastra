/** Real database checks. Run only against a disposable database after migrations. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

async function main() {
  const target = new URL(process.env.DATABASE_URL || "invalid:");
  assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.port, "5548"); assert.equal(target.pathname, "/sastra_integration");
  process.env.APP_ENCRYPTION_KEY ||= randomBytes(32).toString("base64url");
  const { db } = await import("../lib/db");
  const { eq, and, inArray } = await import("drizzle-orm");
  const schema = await import("../lib/db/schema");
  const { user, projects, phases, tasks, lectioConnections, lectioProjectLinks, lectioTaskLinks, lectioRequests,
    workspaceSettings, units, timeEntries, notifications, lectioUnitLinks, lectioOperations, files, projectRoles, projectMembers, planTemplates, phaseTemplates, projectBudgetSettings } = schema;
  const { sealSecret } = await import("../lib/crypto/secret-box");
  const { signRequest } = await import("../lib/lectio/protocol/signing");
  const { POST } = await import("../app/api/integrations/lectio/v1/[operation]/route");
  const id = randomUUID(), secret = randomBytes(32).toString("base64url");
  const actor = `verify-${id}`;
  await db.insert(user).values({ id: actor, name: "Integration verifier", email: `${id}@example.test`, role: "admin" });
  await db.insert(workspaceSettings).values({ id: "workspace", enabledModules: ["lectio"] }).onConflictDoUpdate({ target: workspaceSettings.id, set: { enabledModules: ["lectio"] } });
  const [project] = await db.insert(projects).values({ slug: `integration-${id}`, title: "Integration verification", createdBy: actor, dueDate: "2027-04-30" }).returning();
  const [phase] = await db.insert(phases).values({ projectId: project.id, name: "Translation" }).returning();
  const [role] = await db.insert(projectRoles).values({ key: `publish-${id}`, label: `Publishing ${id}` }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: actor, projectRoleId: role.id });
  const [publishing] = await db.insert(phases).values({ projectId: project.id, name: "Publishing", orderIndex: 1, projectRoleId: role.id, durationDays: 5 }).returning();
  await db.insert(lectioConnections).values({ id, epoch: id, origin: "https://lectio.example", teamId: id, teamName: "Verification", state: "active", incomingSecret: sealSecret(secret), outgoingSecret: sealSecret(secret) });
  const [link] = await db.insert(lectioProjectLinks).values({ connectionId: id, projectId: project.id, remoteProjectId: "source-project", projectKey: id, handoffPhaseId: publishing.id, deliverFiles: true,
    stageMap: [{ stepKey: "translate", phaseId: phase.id }, { stepKey: "review", phaseId: phase.id }] }).returning();
  const snapshot = { protocol: 1, connectionId: id, epoch: id, generation: 1, version: 1,
    project: { id: "source-project", name: "Book", sourceLanguage: "en", targetLanguage: "fr", status: "active" },
    steps: ["translate", "review"].map((key, order) => ({ key, type: key, name: key, order, templateKey: null })),
    people: [], allRequiredWorkComplete: false,
    documents: Array.from({ length: 12 }, (_, order) => ({ id: `chapter-${order}`, name: `Chapter ${order + 1}`, order, fileType: "docx", sourceWordCount: 100, progress: 0,
      steps: ["translate", "review"].map(key => ({ key, state: "pending", activatedAt: null as string | null, completedAt: null as string | null, assigneeIds: [] })) })),
  };
  const url = "https://sastra.example/api/integrations/lectio/v1/snapshot";
  const request = (payload: unknown, operation: string) => {
    const body = JSON.stringify(payload);
    return new Request(url, { method: "POST", body, headers: signRequest({ id, epoch: id, keyId: "initial", secret }, "POST", url, body, operation) });
  };
  const send = (r: Request) => POST(r, { params: Promise.resolve({ operation: "snapshot" }) });
  const { adoptExistingUnits } = await import("../lib/lectio/adoption");
  const [existingUnit] = await db.insert(units).values({ projectId: project.id, name: "Existing chapter" }).returning();
  const [existingTask] = await db.insert(tasks).values({ projectId: project.id, unitId: existingUnit.id, phaseId: phase.id, title: "Chapter 1 · Translation", dueDate: "2027-03-01", dueDateIsManual: true }).returning();
  await db.transaction(tx => adoptExistingUnits(tx, { id: link.id, projectId: project.id, handoffPhaseId: publishing.id }, snapshot as import("../lib/lectio/protocol/contract").ProjectSnapshot, link.stageMap, [{ documentId: "chapter-0", unitId: existingUnit.id }]));
  const first = request(snapshot, "baseline"), replay = first.clone();
  assert.equal((await send(first)).status, 200);
  assert.equal((await send(replay)).status, 409);
  assert.equal((await send(request(snapshot, "baseline"))).status, 200);
  assert.equal((await db.select().from(units).where(eq(units.projectId, project.id))).length, 12);
  const created = await db.select().from(tasks).where(eq(tasks.projectId, project.id));
  assert.equal(created.length, 24); assert.equal(created.filter(t => t.lectioManaged).length, 12); assert.ok(created.every(t => t.status === "todo"));
  assert.equal((await db.select().from(timeEntries).where(inArray(timeEntries.taskId, created.map(t => t.id)))).length, 0);
  assert.equal((await db.select().from(notifications).where(eq(notifications.userId, actor))).length, 0);
  const task = created.find(t => t.lectioManaged && t.title.startsWith("Chapter 1 ·"))!;
  assert.equal(task.id, existingTask.id); assert.equal(task.dueDate, "2027-03-01");
  await db.update(tasks).set({ dueDate: "2027-03-01", dueDateIsManual: true }).where(eq(tasks.id, task.id));
  const downstream = created.find(t => !t.lectioManaged && t.title.startsWith("Chapter 1 ·"))!;
  await db.update(tasks).set({ dueDate: "2027-04-01", dueDateIsManual: true }).where(eq(tasks.id, downstream.id));
  snapshot.version = 2;
  snapshot.documents[0].steps[0].state = "completed"; snapshot.documents[0].steps[0].completedAt = "2026-10-23T10:00:00Z";
  assert.equal((await send(request(snapshot, "progress-2"))).status, 200);
  assert.equal((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].status, "in_progress");
  snapshot.version = 3; snapshot.documents[0].steps[1].state = "completed"; snapshot.documents[0].steps[1].completedAt = "2026-10-23T11:00:00Z";
  assert.equal((await send(request(snapshot, "progress-3"))).status, 200);
  const [handedOff] = await db.select().from(tasks).where(eq(tasks.id, downstream.id));
  assert.equal(handedOff.assignedTo, actor); assert.equal(handedOff.dueDate, "2027-04-01");
  assert.equal((await db.select().from(notifications).where(eq(notifications.userId, actor))).length, 1);
  assert.equal((await send(request(snapshot, "progress-3"))).status, 200);
  assert.equal((await db.select().from(notifications).where(eq(notifications.userId, actor))).length, 1);
  const artifact = { projectId: "source-project", artifactId: randomUUID(), documentId: "chapter-0", generation: 1, version: 3,
    sizeBytes: 12, sha256: "a".repeat(64), name: "Chapter 1.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  async function control(operation: string, body: unknown, key: string) {
    const endpoint = `https://sastra.example/api/integrations/lectio/v1/${operation}`, text = JSON.stringify(body);
    return POST(new Request(endpoint, { method: "POST", body: text, headers: signRequest({ id, epoch: id, keyId: "initial", secret }, "POST", endpoint, text, key) }), { params: Promise.resolve({ operation }) });
  }
  assert.equal((await control("artifact", artifact, "file-1")).status, 200);
  assert.equal((await control("artifact", artifact, "file-1-retry")).status, 200);
  assert.equal((await control("artifact", { ...artifact, sha256: "b".repeat(64) }, "file-corrupt")).status, 409);
  assert.equal((await db.select().from(files).where(eq(files.r2Key, `lectio/${id}/${artifact.artifactId}`))).length, 1);
  assert.equal((await db.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, id), eq(lectioOperations.kind, "artifact-fetch")))).length, 1);
  snapshot.version = 4; snapshot.documents[0].steps[1].state = "active"; snapshot.documents[0].steps[1].completedAt = null;
  assert.equal((await send(request(snapshot, "progress-4"))).status, 200);
  const [saved] = await db.select().from(tasks).where(eq(tasks.id, task.id));
  assert.equal(saved.status, "done"); assert.equal(saved.dueDate, "2027-03-01");
  assert.equal((await db.select().from(lectioTaskLinks).where(eq(lectioTaskLinks.taskId, task.id)))[0].reopenPending, true);
  const bad = structuredClone(snapshot); bad.version = 5; bad.steps.push({ key: "new-stage", type: "new-stage", name: "New stage", order: 2, templateKey: null });
  for (const d of bad.documents) d.steps.push({ key: "new-stage", state: "pending", activatedAt: null, completedAt: null, assigneeIds: [] });
  assert.equal((await send(request(bad, "bad-mapping"))).status, 409);
  assert.equal((await db.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, link.id)))[0].lastVersion, 4);
  assert.equal((await db.select().from(tasks).where(eq(tasks.projectId, project.id))).length, 24);
  const retiredSnapshot = structuredClone(snapshot); retiredSnapshot.version = 5; retiredSnapshot.documents = retiredSnapshot.documents.slice(1);
  assert.equal((await send(request(retiredSnapshot, "document-retired"))).status, 200);
  assert.equal((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].lectioManaged, false);
  assert.equal((await db.select().from(lectioTaskLinks).where(eq(lectioTaskLinks.taskId, task.id)))[0].reopenPending, false);
  await db.update(lectioConnections).set({ state: "paused" }).where(eq(lectioConnections.id, id));
  assert.equal((await send(request(snapshot, "paused"))).status, 401);
  const requests = await db.select().from(lectioRequests).where(eq(lectioRequests.connectionId, id));
  assert.equal(requests.length, 9);
  assert.equal((await control("revoke", {}, "revoke")).status, 200);
  assert.equal((await control("revoke", {}, "revoke")).status, 200);
  assert.equal((await send(request(snapshot, "revoked"))).status, 401);
  assert.equal((await db.select().from(tasks).where(and(eq(tasks.projectId, project.id), eq(tasks.lectioManaged, true)))).length, 0);
  assert.equal((await db.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, link.id)))[0].state, "unlinked");
  assert.ok((await db.select().from(lectioUnitLinks).where(eq(lectioUnitLinks.linkId, link.id))).every(b => !b.active));
  assert.equal((await db.select().from(projects).where(and(eq(projects.id, project.id), eq(projects.status, "planning")))).length, 1);
  const [template] = await db.insert(planTemplates).values({ name: `Connected ${id}` }).returning();
  const [stage] = await db.insert(phaseTemplates).values({ planTemplateId: template.id, name: "Translation" }).returning();
  await db.update(lectioConnections).set({ state: "active", pairedBy: actor, autoCreate: true, profile: { version: 1, planTemplateId: template.id, teamWorkflowId: "team-template", kind: "book", handoffPhaseTemplateId: null, deliverFiles: false, stageMap: snapshot.steps.map(s => ({ stepKey: s.key, phaseId: stage.id })) } }).where(eq(lectioConnections.id, id));
  const fromLectio = structuredClone(snapshot); fromLectio.project.id = "new-source-project"; fromLectio.version = 1;
  for (const step of fromLectio.steps) step.templateKey = step.key as never;
  const creation = { projectKey: randomUUID(), profileVersion: 1, snapshot: fromLectio };
  const createdResponse = await control("create-project", creation, "create-in-sastra");
  assert.equal(createdResponse.status, 200);
  const result = await createdResponse.json() as { remoteProjectId: string };
  assert.equal((await control("create-project", creation, "create-in-sastra")).status, 200);
  assert.equal((await control("create-project", creation, "semantic-retry")).status, 200);
  assert.equal((await db.select().from(units).where(eq(units.projectId, result.remoteProjectId))).length, 12);
  assert.equal((await db.select().from(tasks).where(eq(tasks.projectId, result.remoteProjectId))).length, 12);
  assert.equal((await db.select().from(projectBudgetSettings).where(eq(projectBudgetSettings.projectId, result.remoteProjectId))).length, 1);
  assert.equal((await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, id), eq(lectioProjectLinks.projectKey, creation.projectKey)))).length, 1);
  await db.delete(projects).where(eq(projects.id, result.remoteProjectId));
  const [deletedLink] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, id), eq(lectioProjectLinks.projectKey, creation.projectKey)));
  assert.equal(deletedLink.state, "unlinked"); assert.equal(deletedLink.projectId, null);
  assert.equal((await db.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, id), eq(lectioOperations.operationId, `unlink-${deletedLink.id}-1`))))[0].state, "pending");
  await db.update(lectioConnections).set({ state: "revoked" }).where(eq(lectioConnections.id, id));
  console.log("PASS: 12-document baseline, idempotency/replay, grouped progress, manual dates, reopen review, atomic mapping failure, pause/revoke, deduplicated handoff and file delivery, native connected creation with template/defaults and idempotency, no timer or project-completion side effects.");
}
main().then(() => process.exit(0), error => { console.error(error instanceof Error ? error.message : "Verification failed"); process.exit(1); });
