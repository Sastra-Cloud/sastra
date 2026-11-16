import "server-only";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { budgetApprovalRequests, projects } from "@/lib/db/schema";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { syncBudgetApprovalState } from "./approval-service";

export async function revalidateBudget(projectId: string) {
  const activeApprovalScopes = await db
    .selectDistinct({ printRunId: budgetApprovalRequests.printRunId, quotationId: budgetApprovalRequests.partnerQuotationId })
    .from(budgetApprovalRequests)
    .where(
      and(
        eq(budgetApprovalRequests.projectId, projectId),
        ne(budgetApprovalRequests.status, "superseded")
      )
    );
  const scopes = new Map<string, { printRunId: string | null; quotationId: string | null }>();
  scopes.set("main", { printRunId: null, quotationId: null });
  for (const scope of activeApprovalScopes) scopes.set(`${scope.printRunId ?? "main"}:${scope.quotationId ?? "budget"}`, scope);
  await Promise.all([...scopes.values()].map(scope => syncBudgetApprovalState(projectId, scope.printRunId, scope.quotationId)));
  await recomputeProjectBlockers(projectId);
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) {
    revalidatePath(`/projects/${p.slug}/budget`);
    revalidatePath(`/projects/${p.slug}/rights`);
    revalidatePath(`/projects/${p.slug}/print`);
    revalidatePath(`/projects/${p.slug}/tasks`);
    revalidatePath(`/projects/${p.slug}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");
  }
}
