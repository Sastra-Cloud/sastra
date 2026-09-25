import { Sparkles } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { createDraft } from "@/lib/ai/planner-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ContentColumn, PageShell } from "@/components/cockpit";

export const metadata = { title: "Plan with AI" };

export default async function PlanEntryPage() {
  await requireRole("manager");
  return (
    <PageShell>
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Plan a project with AI
        </h1>
        <p className="text-muted-foreground">
          Answer a few questions and the planner drafts phases, tasks and
          chapters you can review and tweak before creating the project.
        </p>
      </div>
      <ContentColumn width="compact" className="max-w-xl">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 py-6">
            <div className="flex items-center gap-3">
              <Sparkles className="size-6 text-info" />
              <p className="text-sm text-muted-foreground">
                The interview takes a minute. Nothing is created until you commit.
              </p>
            </div>
            <form action={createDraft}>
              <Button type="submit">Start planning</Button>
            </form>
          </CardContent>
        </Card>
      </ContentColumn>
    </PageShell>
  );
}
