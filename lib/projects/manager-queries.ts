import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectManagers, user } from "@/lib/db/schema";

export async function listProjectManagers(projectId: string) {
  return db.select({ userId: user.id, name: user.name, image: user.image })
    .from(projectManagers).innerJoin(user, eq(user.id, projectManagers.userId))
    .where(eq(projectManagers.projectId, projectId)).orderBy(asc(user.name));
}
