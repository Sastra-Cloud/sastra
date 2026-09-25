import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { userGuidanceDismissals } from "@/lib/db/schema";

/** Load the coaching elements dismissed by one user on any device. */
export async function listGuidanceDismissals(userId: string): Promise<string[]> {
  const rows = await db
    .select({ guidanceKey: userGuidanceDismissals.guidanceKey })
    .from(userGuidanceDismissals)
    .where(eq(userGuidanceDismissals.userId, userId));
  return rows.map((row) => row.guidanceKey);
}
