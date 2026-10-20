import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { saveBudgetPresentation } from "@/lib/budget/actions";
import { budgetPresentationSchema } from "@/lib/budget/presentation-input";
import { db } from "@/lib/db";
import { printRuns, projects } from "@/lib/db/schema";
import { hasTrustedRequestOrigin } from "@/lib/security/request-origin";

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  if (!hasTrustedRequestOrigin(request)) {
    return Response.json({ error: "This request could not be verified." }, { status: 403 });
  }
  const session = await getSession();
  if (!session?.user.isActive) {
    return Response.json({ error: "Sign in again before saving the partner quote." }, { status: 401 });
  }
  if (!can(session.user, "budget.edit")) {
    return Response.json({ error: "A manager must save the partner quote." }, { status: 403 });
  }
  const parsed = budgetPresentationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Check the quote fields and try saving again." }, { status: 400 });
  }
  const { slug } = await context.params;
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  if (parsed.data.printRunId) {
    const [run] = await db.select({ id: printRuns.id }).from(printRuns).where(and(
      eq(printRuns.id, parsed.data.printRunId), eq(printRuns.projectId, project.id)
    )).limit(1);
    if (!run) return Response.json({ error: "This print run does not belong to the project." }, { status: 400 });
  }
  try {
    return Response.json(await saveBudgetPresentation(project.id, parsed.data));
  } catch {
    return Response.json({ error: "Could not save the partner quote. Your edits are still here. Try again." }, { status: 500 });
  }
}
