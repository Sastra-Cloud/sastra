"use server";

import { and, eq } from "drizzle-orm";

import type { ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { userGuidanceDismissals } from "@/lib/db/schema";

const GUIDANCE_KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,119}$/;

function validateGuidanceKey(guidanceKey: string): ActionResult | null {
  if (GUIDANCE_KEY_PATTERN.test(guidanceKey)) return null;
  return {
    ok: false,
    error: { message: "That guidance item is not valid." },
  };
}

/** Optimistically hide one coaching element for the signed-in user. */
export async function dismissGuidanceKey(
  guidanceKey: string
): Promise<ActionResult> {
  const invalid = validateGuidanceKey(guidanceKey);
  if (invalid) return invalid;

  const { user } = await requireUser();
  await db
    .insert(userGuidanceDismissals)
    .values({ userId: user.id, guidanceKey })
    .onConflictDoNothing();
  return { ok: true };
}

/** Restore one coaching element for the signed-in user. */
export async function restoreGuidanceKey(
  guidanceKey: string
): Promise<ActionResult> {
  const invalid = validateGuidanceKey(guidanceKey);
  if (invalid) return invalid;

  const { user } = await requireUser();
  await db
    .delete(userGuidanceDismissals)
    .where(
      and(
        eq(userGuidanceDismissals.userId, user.id),
        eq(userGuidanceDismissals.guidanceKey, guidanceKey)
      )
    );
  return { ok: true };
}
