import { requireRole } from "@/lib/auth/guards";
import {
  getAiSpendByProject,
  getAiUsageSettingsReport,
  getUnifiedUsageByModel,
  getUnifiedUsageOverTime,
  getUnifiedUsageTotals,
  getUsageByUser,
  getWorkspaceUsageByTask,
} from "@/lib/ai/usage-queries";
import { parseRange } from "@/lib/assistant/usage-math";
import { AiUsageReport } from "@/components/settings/ai-usage-report";

export const metadata = { title: "AI usage" };
export const dynamic = "force-dynamic";

export default async function CostsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole("admin");
  const range = parseRange((await searchParams).range);

  const [
    totals,
    overTime,
    byModel,
    byUser,
    byTask,
    byProject,
    settingsReport,
  ] = await Promise.all([
    getUnifiedUsageTotals(range),
    getUnifiedUsageOverTime(range),
    getUnifiedUsageByModel(range),
    getUsageByUser(range),
    getWorkspaceUsageByTask(range),
    getAiSpendByProject(range),
    getAiUsageSettingsReport(),
  ]);

  return (
    <AiUsageReport
      range={range}
      totals={totals}
      overTime={overTime}
      byModel={byModel}
      byUser={byUser}
      byTask={byTask}
      byProject={byProject}
      settingsReport={settingsReport}
    />
  );
}
