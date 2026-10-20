"use server";

import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { searchTasksOutsideMyWork, type MyWorkTaskRow } from "./queries";
import { TASK_SEARCH_LIMIT, taskSearchTerms } from "./search";

/** Read-only search for tasks that are not in the caller's My Work lists. */
export async function listTaskSearchResults(
  query: string
): Promise<{ tasks: MyWorkTaskRow[]; hasMore: boolean }> {
  const { user } = await requireUser();
  const terms = taskSearchTerms(z.string().max(500).parse(query));
  if (terms.length === 0) return { tasks: [], hasMore: false };
  const rows = await searchTasksOutsideMyWork({
    userId: user.id,
    canManage: can(user, "tasks.manage"),
    terms,
    limit: TASK_SEARCH_LIMIT + 1,
  });
  return { tasks: rows.slice(0, TASK_SEARCH_LIMIT), hasMore: rows.length > TASK_SEARCH_LIMIT };
}
