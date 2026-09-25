"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

// A "use server" module may only export async functions, so the level type and
// its normalizer stay local (nothing outside this file needs them).
type GuidanceLevel = "on" | "off";

function normalizeGuidanceLevel(value: unknown): GuidanceLevel {
  return value === "off" ? "off" : "on";
}

/**
 * Set how much guidance this user sees. This is the global switch; individual
 * coach cards and wizards are still dismissible for the individual user.
 * Optimistic per the interaction policy (the `set` prefix classifies it).
 */
export async function setGuidanceLevel(level: GuidanceLevel) {
  const { user: u } = await requireUser();
  await db
    .update(user)
    .set({ guidanceLevel: normalizeGuidanceLevel(level), updatedAt: new Date() })
    .where(eq(user.id, u.id));
  revalidatePath("/settings/profile");
}
