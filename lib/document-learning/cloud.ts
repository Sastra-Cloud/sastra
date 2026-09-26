import "server-only";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sharedDocumentLibrary } from "@/lib/db/schema";
import { MANAGEMENT_HEADERS, signManagementRequest, verifyManagementRequest } from "@/lib/hosted/management-auth";
import { hostedAccountUrl, hostedInstanceId } from "@/lib/hosted/mode";
import { publishedRuleSchema, sharedRulePrompt, sharedRuleSchema, type SharedDocumentRule } from "./shared-rules";

function cloudConnection() {
  const accountUrl = hostedAccountUrl();
  const instanceId = hostedInstanceId();
  const secret = process.env.SASTRA_CLOUD_MANAGEMENT_SECRET?.trim();
  if (!accountUrl || !instanceId || !secret) return null;
  return { url: `${accountUrl.replace(/\/+$/, "")}/instances/${encodeURIComponent(instanceId)}/document-lessons`, secret };
}

function signedHeaders(secret: string, eventId: string, body: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    "content-type": "application/json",
    [MANAGEMENT_HEADERS.timestamp]: String(timestamp),
    [MANAGEMENT_HEADERS.eventId]: eventId,
    [MANAGEMENT_HEADERS.signature]: signManagementRequest(secret, timestamp, eventId, body),
  };
}

export async function submitSharedRule(rule: SharedDocumentRule, eventId: string) {
  const connection = cloudConnection();
  if (!connection) throw new Error("Cloud contributions are available on hosted instances only.");
  const body = JSON.stringify(sharedRuleSchema.parse(rule));
  const response = await fetch(connection.url, {
    method: "POST", headers: signedHeaders(connection.secret, eventId, body),
    body, signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Cloud could not receive this lesson. Try again later.");
}

async function syncSharedRules() {
  const connection = cloudConnection();
  if (!connection) return;
  await db.insert(sharedDocumentLibrary).values({ id: "library" }).onConflictDoNothing();
  const [current] = await db.select().from(sharedDocumentLibrary)
    .where(eq(sharedDocumentLibrary.id, "library")).limit(1);
  if (current?.attemptedAt && Date.now() - current.attemptedAt.getTime() < 60 * 60_000) return;
  await db.update(sharedDocumentLibrary).set({ attemptedAt: new Date() })
    .where(eq(sharedDocumentLibrary.id, "library"));
  try {
    const eventId = `lessons_${randomUUID()}`;
    const response = await fetch(connection.url, {
      method: "GET", headers: signedHeaders(connection.secret, eventId, ""),
      signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 128_000) throw new Error("Cloud lesson response too large");
    const verified = verifyManagementRequest({ secret: connection.secret, headers: response.headers, body });
    if (!verified.ok) throw new Error("Cloud lesson response signature invalid");
    const parsed = JSON.parse(body) as { version?: unknown; lessons?: unknown };
    if (!Number.isSafeInteger(parsed.version) || Number(parsed.version) < 0 || !Array.isArray(parsed.lessons) || parsed.lessons.length > 100) {
      throw new Error("Cloud lesson response invalid");
    }
    const lessons = parsed.lessons.map((lesson) => publishedRuleSchema.parse(lesson));
    if (Number(parsed.version) < (current?.version ?? 0)) return;
    await db.update(sharedDocumentLibrary).set({ version: Number(parsed.version), lessons, syncedAt: new Date() })
      .where(eq(sharedDocumentLibrary.id, "library"));
  } catch (error) {
    console.error("Shared document lesson sync failed:", error);
  }
}

export async function cloudDocumentGuidance(workflow: SharedDocumentRule["workflow"]) {
  await syncSharedRules();
  const [library] = await db.select().from(sharedDocumentLibrary)
    .where(eq(sharedDocumentLibrary.id, "library")).limit(1);
  return sharedRulePrompt(library?.lessons ?? [], workflow);
}
