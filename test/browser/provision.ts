/**
 * Provisions the disposable browser-test fixture: one administrator created
 * through the real Better Auth sign-up endpoint, a workspace that has finished
 * setup, one project with tasks, and long chat histories.
 *
 * Run only by scripts/browser-tests-lib.mjs, against a sastra_browser_*
 * database on this machine. Credentials come from the environment, are random
 * per run, and are never written to disk.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  chatChannels,
  chatMessages,
  projects,
  tasks,
  user,
  userGuidanceDismissals,
  workspaceSettings,
} from "../../lib/db/schema";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const databaseUrl = required("DATABASE_URL");
const baseUrl = required("SASTRA_BROWSER_BASE_URL");
const origin = process.env.SASTRA_BROWSER_ORIGIN ?? baseUrl;
const email = required("SASTRA_BROWSER_EMAIL").toLowerCase();
const password = required("SASTRA_BROWSER_PASSWORD");
const state = required("SASTRA_BROWSER_STATE");
const provisioningSecret = required("AUTH_PROVISIONING_SECRET");

// Same guards as the runner, repeated because this script writes data.
const target = new URL(databaseUrl);
if (
  process.env.SASTRA_DISPOSABLE_DATABASE !== "true" ||
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
  !/^sastra_browser_[a-z0-9]{8,24}$/.test(target.pathname.slice(1))
) {
  throw new Error("Refusing to provision: not a disposable local sastra_browser_* database.");
}

/** Mirrors lib/auth/provisioning.ts (server-only), so a drift fails loudly with a 403. */
function bootstrapGrant(address: string) {
  const payload = {
    email: address,
    purpose: "bootstrap",
    issuedAt: Date.now(),
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", provisioningSecret)
    .update(`sastra-provisioning-v1.${encoded}`)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

/** Time-ordered ids, like the app's own, so unread comparisons behave. */
function orderedId(at: number, counter: number) {
  const hex = at.toString(16).padStart(12, "0");
  const tail = counter.toString(16).padStart(6, "0");
  const random = randomBytes(8).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${tail.slice(0, 3)}-8${tail.slice(3, 6)}-${random.slice(0, 12)}`;
}

async function main() {
  const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-sastra-provisioning": bootstrapGrant(email),
    },
    body: JSON.stringify({ name: "Browser Tester", email, password }),
  });
  if (!signUp.ok) throw new Error(`Sign-up through Better Auth failed (HTTP ${signUp.status}).`);

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const db = drizzle(sql);
  try {
    // Mirrors the first-run flow: the first account owns the workspace.
    await db.update(user).set({ role: "super_admin" }).where(eq(user.email, email));
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!admin) throw new Error("The administrator account was not created.");

    // The settings row may not exist before the first read, so upsert it.
    const completedSetup = {
      orgName: "Browser Test Ministry",
      sourceLanguage: "English",
      targetLanguage: "Khmer",
      setupCompletedAt: new Date(),
    };
    await db
      .insert(workspaceSettings)
      .values({ id: "workspace", ...completedSetup })
      .onConflictDoUpdate({ target: workspaceSettings.id, set: completedSetup });

    // The assistant's first-run tip floats over short phone screens and would
    // cover what the scenarios click. The tester has already hidden it, exactly
    // as a person would; every other tip and the setup checklist stay on.
    await db
      .insert(userGuidanceDismissals)
      .values({ userId: admin.id, guidanceKey: "assistant:intro" })
      .onConflictDoNothing();

    const [project] = await db
      .insert(projects)
      .values({ slug: "browser-test-book", title: "Browser Test Book", status: "active", kind: "book" })
      .returning({ id: projects.id });

    const today = new Date();
    const dayOffset = (days: number) => {
      const date = new Date(today.getTime() + days * 86_400_000);
      return date.toISOString().slice(0, 10);
    };
    await db.insert(tasks).values(
      Array.from({ length: 14 }, (_, index) => ({
        projectId: project.id,
        title: `Browser test task ${index + 1}`,
        assignedTo: admin.id,
        createdBy: admin.id,
        status: "todo" as const,
        dueDate: dayOffset(index % 4 === 0 ? 0 : index - 3),
        orderIndex: index,
        rank: index,
      }))
    );

    const [projectChannel] = await db
      .insert(chatChannels)
      .values({ projectId: project.id, name: "Browser Test Book", kind: "project" })
      .returning({ id: chatChannels.id });
    const [general] = await db
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.kind, "general"))
      .limit(1);
    if (!general) throw new Error("The bootstrap did not create the general channel.");

    const lines = [
      "Short note.",
      "Please review the latest chapter draft before Friday and add comments where the terminology needs a decision.",
      "Thanks, that works for me.",
      "Uploaded the revised cover options. The second one reads better at small sizes, especially on a phone screen in bright light.",
    ];
    const start = Date.now() - 200 * 60_000;
    async function seedMessages(channelId: string, count: number) {
      const rows = Array.from({ length: count }, (_, index) => {
        const at = start + index * 60_000;
        return {
          id: orderedId(at, index),
          channelId,
          userId: admin.id,
          content: `${index + 1}. ${lines[index % lines.length]}`,
          createdAt: new Date(at),
          updatedAt: new Date(at),
        };
      });
      for (let from = 0; from < rows.length; from += 50) {
        await db.insert(chatMessages).values(rows.slice(from, from + 50));
      }
    }
    await seedMessages(general.id, 120);
    await seedMessages(projectChannel.id, 60);

    writeFileSync(
      join(state, "fixtures.json"),
      JSON.stringify({
        projectSlug: "browser-test-book",
        generalChannelId: general.id,
        projectChannelId: projectChannel.id,
        lastGeneralMessage: "120.",
        runId: randomUUID(),
      })
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log("Browser fixture ready.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Fixture provisioning failed.");
  process.exit(1);
});
