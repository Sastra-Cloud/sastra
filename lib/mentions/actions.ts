"use server";

import { requireUser } from "@/lib/auth/guards";
import {
  listAllMentionTargets,
  listProjectMentionTargets,
  type MentionTarget,
} from "./roster";

/**
 * Roster for the @mention picker. Lazily fetched by the composer the first time
 * someone types `@`. Pass a `projectId` to scope suggestions to that project's
 * team (members + managers); omit it for team-wide surfaces.
 */
export async function getMentionTargets(scope?: {
  projectId?: string | null;
}): Promise<MentionTarget[]> {
  await requireUser();
  const projectId = scope?.projectId;
  return projectId
    ? listProjectMentionTargets(projectId)
    : listAllMentionTargets();
}
