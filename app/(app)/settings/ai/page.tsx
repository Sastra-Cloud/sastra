import Link from "next/link";
import { ChevronDown, CircleDollarSign, SlidersHorizontal } from "lucide-react";

import { requireRole } from "@/lib/auth/guards";
import { isSuperAdminRole } from "@/lib/auth/policy";
import { getAiUsageSettings } from "@/lib/ai/usage";
import { getOpenRouterApiKeyStatus } from "@/lib/ai/keys";
import { AiKeyCard } from "@/components/settings/ai-key-card";
import { isHostedInstance } from "@/lib/hosted/mode";
import { typesafeConfigured } from "@/lib/ai/typesafe";
import { TypesafeToggle } from "@/components/settings/typesafe-toggle";
import { Badge } from "@/components/ui/badge";
import { listAiTaskModels } from "@/lib/ai/queries";
import { AiModelsManager } from "@/components/settings/ai-models-manager";
import { AssistantLearningManager } from "@/components/settings/assistant-learning-manager";
import { EmailLearningManager } from "@/components/settings/email-learning-manager";
import { getAssistantLearningReport } from "@/lib/assistant/learning-queries";
import { listEmailSignalLessons } from "@/lib/email/signal-lessons-queries";
import { Button } from "@/components/ui/button";
import { listWorkspaceEmailTaskRules } from "@/lib/email/task-rule-queries";
import { EmailTaskLearningRules } from "@/components/tasks/email-task-learning-rules";

export const metadata = { title: "AI settings" };
export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const session = await requireRole("admin");
  const isSuperAdmin = isSuperAdminRole(session.user);
  const [rows, learningReport, emailLessons, emailTaskRules, usageSettings, keyStatus] =
    await Promise.all([
      listAiTaskModels(),
      getAssistantLearningReport(),
      listEmailSignalLessons(),
      listWorkspaceEmailTaskRules(),
      isSuperAdmin ? getAiUsageSettings() : Promise.resolve(null),
      getOpenRouterApiKeyStatus(),
    ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium">AI behavior</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Review what the assistant has learned and tune the models used by each task.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/settings/costs" />}
          variant="outline"
          size="sm"
        >
          <CircleDollarSign className="size-4" />
          AI usage
        </Button>
      </section>
      {/* Sastra Cloud runs AI on the plan's credits only; the key card is a self-hosted feature. */}
      {isHostedInstance() ? null : <AiKeyCard status={keyStatus} />}
      {usageSettings ? (
        <TypesafeToggle
          defaultEnabled={usageSettings.typesafeEnabled}
          configured={typesafeConfigured()}
        />
      ) : null}
      <AssistantLearningManager report={learningReport} />
      <EmailLearningManager lessons={emailLessons} />
      <EmailTaskLearningRules rules={emailTaskRules} workspace />
      <section aria-labelledby="model-routing-heading" className="pt-2">
        <details className="group overflow-hidden rounded-xl border bg-card">
          <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-4 select-none marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SlidersHorizontal className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  id="model-routing-heading"
                  className="font-heading text-base font-medium"
                >
                  Model routing
                </span>
                <Badge variant="outline">Advanced</Badge>
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Change the models, fallbacks, and temperatures used by each AI task.
              </span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="border-t px-4 py-5 sm:px-5">
            <AiModelsManager
              hosted={isHostedInstance()}
              rows={rows.map((r) => ({
                taskKey: r.taskKey,
                model: r.model,
                fallbackModels: r.fallbackModels,
                temperature: r.temperature,
              }))}
            />
          </div>
        </details>
      </section>
    </div>
  );
}
