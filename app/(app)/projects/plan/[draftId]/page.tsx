import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { aiPlanDrafts } from "@/lib/db/schema";
import { PlannerWorkspace } from "@/components/ai/planner-workspace";

export const metadata = { title: "Plan with AI" };
export const dynamic = "force-dynamic";

export default async function PlanDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  await requireRole("manager");
  const { draftId } = await params;
  const [draft] = await db
    .select()
    .from(aiPlanDrafts)
    .where(eq(aiPlanDrafts.id, draftId))
    .limit(1);
  if (!draft) notFound();

  return (
    <PlannerWorkspace
      draftId={draftId}
      initialConversation={draft.conversation}
      initialPlan={draft.proposedPlan ?? null}
      initialStatus={draft.status}
    />
  );
}
