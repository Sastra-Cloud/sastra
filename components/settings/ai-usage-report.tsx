"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Cloud,
  Coins,
  DollarSign,
  HardDrive,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { StatCard } from "@/components/portfolio/stat-card";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateAiUsageSettings } from "@/lib/ai/usage-actions";
import { findModel } from "@/lib/ai/model-catalog";
import {
  RANGE_OPTIONS,
  formatTokens,
  type UsageRange,
} from "@/lib/assistant/usage-math";
import {
  AI_ALLOWANCE_WARN_PERCENT,
  aiAmountLabel,
  formatAiAmount,
  type AiAmountUnit,
} from "@/lib/ai/amount-format";
import { CREDITS_USED_UP_MESSAGE } from "@/lib/hosted/credits";
import type {
  AiSpendByProject,
  UnifiedUsageTotals,
  UsageBucket,
  UsageByModel,
  UsageByUser,
  WorkspaceUsageByTask,
} from "@/lib/ai/usage-queries";
import { cn } from "@/lib/utils";
import { UsageAreaChart } from "@/components/settings/charts/usage-area-chart";
import { UsageModelDonut } from "@/components/settings/charts/usage-model-donut";
import { UserAvatar } from "@/components/ui/user-avatar";

type BudgetStatusView = {
  spentUsd: number;
  budgetUsd: number;
  enabled: boolean;
  remainingUsd: number;
  percentUsed: number;
  blocked: boolean;
};

type R2EstimateView = {
  storageGbMonth: number;
  fileCount: number;
  classAOperations: number;
  classBOperations: number;
  storageCostUsd: number;
  classACostUsd: number;
  classBCostUsd: number;
  totalCostUsd: number;
};

type UsageSettingsReport = {
  /** True on Sastra Cloud, where the plan sets the workspace AI allowance. */
  budgetManagedByPlan: boolean;
  /** Credits on Sastra Cloud; dollars when self-hosted. */
  unit: AiAmountUnit;
  /** Where a hosted customer buys credits or changes the plan. */
  accountUrl: string | null;
  settings: {
    workspaceAiMonthlyBudgetUsd: number;
    workspaceAiEnabled: boolean;
    cloudflareMonthlyBudgetUsd: number;
    cloudflareEnabled: boolean;
  };
  workspaceBudget: BudgetStatusView;
  cloudflareBudget: BudgetStatusView;
  r2Estimate: R2EstimateView;
};

function modelLabel(provider: string, slug: string): string {
  if (provider === "cloudflare_workers_ai") return "Cloudflare voice";
  return findModel(slug)?.label ?? slug;
}

function sourceLabel(provider: string): string {
  if (provider === "cloudflare_workers_ai") return "Workers AI";
  if (provider === "cloudflare_r2") return "R2";
  return "OpenRouter";
}

function taskLabel(feature: string, operation: string) {
  const clean = (s: string) => s.replaceAll("_", " ");
  return `${clean(feature)} / ${clean(operation)}`;
}

const fmt = (usd: number, unit: AiAmountUnit) => formatAiAmount(usd, unit);
const fmtCompact = (usd: number, unit: AiAmountUnit) =>
  formatAiAmount(usd, unit, { compact: true });

function BudgetMeter({
  title,
  status,
  unit,
}: {
  title: string;
  status: BudgetStatusView;
  unit: AiAmountUnit;
}) {
  const credits = unit === "credits";
  const nearLimit =
    status.enabled && !status.blocked && status.percentUsed >= AI_ALLOWANCE_WARN_PERCENT;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmtCompact(status.spentUsd, unit)} of {fmt(status.budgetUsd, unit)} used
          </p>
        </div>
        {!status.enabled ? (
          <Badge variant="outline">disabled</Badge>
        ) : status.blocked ? (
          <Badge variant="destructive">{credits ? "used up" : "blocked"}</Badge>
        ) : nearLimit ? (
          <Badge variant="secondary">almost used up</Badge>
        ) : null}
      </div>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{status.percentUsed}%</span>
          <span>{fmtCompact(status.remainingUsd, unit)} left</span>
        </div>
        <AnimatedBar
          value={status.percentUsed}
          className={cn(
            status.blocked || status.percentUsed >= 90
              ? "bg-destructive"
              : nearLimit
                ? "bg-amber-500"
                : "bg-primary"
          )}
          trackClassName="h-1.5"
        />
      </div>
    </div>
  );
}

function UsageLimitControls({ report }: { report: UsageSettingsReport }) {
  const unit = report.unit;
  const credits = unit === "credits";
  const workspaceStatus = report.workspaceBudget;
  const creditsNearLimit =
    credits &&
    workspaceStatus.enabled &&
    !workspaceStatus.blocked &&
    workspaceStatus.percentUsed >= AI_ALLOWANCE_WARN_PERCENT;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [workspaceBudget, setWorkspaceBudget] = useState(
    String(report.settings.workspaceAiMonthlyBudgetUsd)
  );
  const [workspaceEnabled, setWorkspaceEnabled] = useState(
    report.settings.workspaceAiEnabled
  );
  const [cloudflareBudget, setCloudflareBudget] = useState(
    String(report.settings.cloudflareMonthlyBudgetUsd)
  );
  const [cloudflareEnabled, setCloudflareEnabled] = useState(
    report.settings.cloudflareEnabled
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{credits ? "AI credits this month" : "Monthly limits"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn("grid gap-3", !credits && "lg:grid-cols-2")}>
          <BudgetMeter
            title={credits ? "AI credits" : "Workspace/admin AI"}
            status={report.workspaceBudget}
            unit={unit}
          />
          {!credits ? (
            <BudgetMeter
              title="Workers AI voice and R2"
              status={report.cloudflareBudget}
              unit={unit}
            />
          ) : null}
        </div>
        {credits && workspaceStatus.enabled && workspaceStatus.blocked ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="status">
            {CREDITS_USED_UP_MESSAGE}
            {report.accountUrl ? (
              <>
                {" "}
                <a href={report.accountUrl} className="font-medium underline">
                  Buy more credits
                </a>
              </>
            ) : null}
          </p>
        ) : creditsNearLimit ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm" role="status">
            Almost out of AI credits for this month. They refill on the 1st.
            {report.accountUrl ? (
              <>
                {" "}
                <a href={report.accountUrl} className="font-medium underline">
                  Buy more credits
                </a>
              </>
            ) : null}
          </p>
        ) : null}

        <div className={cn("grid gap-4 lg:items-end", credits ? "lg:grid-cols-[1fr_auto]" : "lg:grid-cols-[1fr_1fr_auto]")}>
          <div className="grid gap-1">
            {report.budgetManagedByPlan ? (
              <>
                <p className="text-xs font-medium">Workspace/admin AI budget</p>
                <p className="text-xs text-muted-foreground">
                  Your plan sets this limit. Add an AI credit pack from your
                  account page to raise it.
                </p>
              </>
            ) : (
              <>
                <Label htmlFor="workspace-ai-budget" className="text-xs">
                  Workspace/admin AI budget
                </Label>
                <Input
                  id="workspace-ai-budget"
                  type="number"
                  min="0"
                  step="1"
                  value={workspaceBudget}
                  onChange={(e) => setWorkspaceBudget(e.target.value)}
                />
              </>
            )}
            <Label className="mt-1 text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={workspaceEnabled}
                onCheckedChange={(checked) => setWorkspaceEnabled(checked === true)}
              />
              Allow background/admin OpenRouter usage
            </Label>
          </div>

          {credits ? null : (
          <div className="grid gap-1">
            <Label htmlFor="cloudflare-budget" className="text-xs">
              Cloudflare budget
            </Label>
            <Input
              id="cloudflare-budget"
              type="number"
              min="0"
              step="1"
              value={cloudflareBudget}
              onChange={(e) => setCloudflareBudget(e.target.value)}
            />
            <Label className="mt-1 text-xs font-normal text-muted-foreground">
              <Checkbox
                checked={cloudflareEnabled}
                onCheckedChange={(checked) => setCloudflareEnabled(checked === true)}
              />
              Allow Workers AI voice transcription
            </Label>
          </div>
          )}

          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                try {
                  await updateAiUsageSettings({
                    ...(report.budgetManagedByPlan
                      ? {}
                      : { workspaceAiMonthlyBudgetUsd: Number(workspaceBudget) }),
                    workspaceAiEnabled: workspaceEnabled,
                    cloudflareMonthlyBudgetUsd: Number(cloudflareBudget),
                    cloudflareEnabled,
                  });
                  toast.success("Usage limits saved");
                  router.refresh();
                } catch {
                  toast.error("Couldn't save usage limits");
                }
              })
            }
          >
            {pending ? "Saving..." : "Save limits"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UserUsageCard({
  user,
  range,
  unit,
}: {
  user: UsageByUser;
  range: UsageRange;
  unit: AiAmountUnit;
}) {
  const pct =
    user.budgetUsd > 0
      ? Math.min(100, Math.round((user.spendUsd / user.budgetUsd) * 100))
      : 0;
  const over = range === "month" && user.spendUsd >= user.budgetUsd;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <UserAvatar name={user.name} image={user.image} className="size-8" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            {!user.enabled ? <Badge variant="outline">disabled</Badge> : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Requests</p>
              <p className="tabular-nums">{user.requests.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tokens</p>
              <p className="tabular-nums">{formatTokens(user.tokens)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{aiAmountLabel(unit)}</p>
              <p className="tabular-nums">{fmtCompact(user.spendUsd, unit)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums text-muted-foreground">
                {range === "month" ? `${pct}% of ${unit === "credits" ? "credits" : "budget"}` : `${fmt(user.budgetUsd, unit)}/mo`}
              </span>
              {over ? <Badge variant="destructive">over</Badge> : null}
            </div>
            {range === "month" ? (
              <AnimatedBar
                value={pct}
                className={cn(pct >= 100 ? "bg-destructive" : "bg-primary")}
                trackClassName="h-1.5"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiUsageReport({
  range,
  totals,
  overTime,
  byModel,
  byUser,
  byTask,
  byProject,
  settingsReport,
}: {
  range: UsageRange;
  totals: UnifiedUsageTotals;
  overTime: UsageBucket[];
  byModel: UsageByModel[];
  byUser: UsageByUser[];
  byTask: WorkspaceUsageByTask[];
  byProject: AiSpendByProject[];
  settingsReport: UsageSettingsReport;
}) {
  const unit = settingsReport.unit;
  const credits = unit === "credits";
  const spendByBucket = new Map(overTime.map((bucket) => [bucket.bucket, bucket.spendUsd]));
  const areaData = [...spendByBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, value]) => ({
      label: range === "all" ? bucket.slice(0, 7) : bucket.slice(5),
      value,
    }));
  const donutData = [
    ...byModel.map((model) => ({
      label: modelLabel(model.provider, model.model),
      value: model.spendUsd,
    })),
    // Storage is included in a hosted plan, so it is not part of the credit mix.
    ...(credits ? [] : [{ label: "Cloudflare R2", value: settingsReport.r2Estimate.totalCostUsd }]),
  ];
  const trackedSpend = totals.spendUsd;
  const cloudflareSpend = totals.cloudflareSpendUsd;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-medium">Costs &amp; usage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {credits
              ? "See how this month's AI credits are being used and by what."
              : "Track provider-reported usage, calculated infrastructure estimates, and workspace limits."}
          </p>
        </div>
        <nav
          aria-label="Usage reporting period"
          className="inline-flex rounded-lg border p-0.5 text-sm"
        >
          {RANGE_OPTIONS.map((opt) => (
            <Link
              key={opt.key}
              href={`/settings/costs?range=${opt.key}`}
              scroll={false}
              className={cn(
                "rounded-md px-2.5 py-1 transition-colors",
                range === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </Link>
          ))}
        </nav>
      </div>

      {credits ? null : (
      <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <span>
          <Badge variant="secondary" className="mr-1.5">
            Provider reported
          </Badge>
          OpenRouter usage
        </span>
        <span>
          <Badge variant="outline" className="mr-1.5">
            Calculated
          </Badge>
          R2 storage and Workers AI estimates
        </span>
        <span className="basis-full">
          Current monthly storage estimates remain included when you change the
          reporting period.
        </span>
      </div>
      )}

      <div className={cn("grid gap-4 sm:grid-cols-2", credits ? "xl:grid-cols-4" : "xl:grid-cols-5")}>
        <StatCard
          icon={credits ? Coins : DollarSign}
          label={credits ? "Credits used" : "Tracked estimate"}
          value={fmtCompact(trackedSpend, unit)}
        />
        <StatCard
          icon={Activity}
          label="AI calls"
          value={totals.aiCalls.toLocaleString()}
        />
        <StatCard icon={Coins} label="Tokens" value={formatTokens(totals.tokens)} />
        {credits ? null : (
          <StatCard
            icon={Cloud}
            label="Cloudflare"
            value={fmtCompact(cloudflareSpend, unit)}
          />
        )}
        <StatCard
          icon={Users}
          label="Active users"
          value={totals.activeUsers.toLocaleString()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {credits ? "Credits used over time" : "Metered spend over time"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageAreaChart data={areaData} unit={unit} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {credits ? "Credits by model" : "Estimated cost mix"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UsageModelDonut data={donutData} unit={unit} />
          </CardContent>
        </Card>
      </div>

      <UsageLimitControls report={settingsReport} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Workspace/admin tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {byTask.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No background/admin AI usage in this period.
              </p>
            ) : (
              <>
                <div className="space-y-2 sm:hidden">
                  {byTask.map((row) => (
                    <div
                      key={`${row.provider}:${row.feature}:${row.operation}`}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 capitalize">
                          {taskLabel(row.feature, row.operation)}
                        </p>
                        <Badge variant="outline">{sourceLabel(row.provider)}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Calls</p>
                          <p className="tabular-nums">
                            {row.requests.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tokens</p>
                          <p className="tabular-nums">{formatTokens(row.tokens)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{aiAmountLabel(unit)}</p>
                          <p className="tabular-nums">
                            {fmtCompact(row.spendUsd, unit)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">{aiAmountLabel(unit)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byTask.map((row) => (
                      <TableRow
                        key={`${row.provider}:${row.feature}:${row.operation}`}
                      >
                        <TableCell className="capitalize">
                          {taskLabel(row.feature, row.operation)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{sourceLabel(row.provider)}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.requests.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTokens(row.tokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtCompact(row.spendUsd, unit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {credits ? null : (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <HardDrive className="size-4" />
              R2 monthly estimate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Storage</span>
                <span className="tabular-nums">
                  {settingsReport.r2Estimate.storageGbMonth.toFixed(2)} GB-month
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Files</span>
                <span className="tabular-nums">
                  {settingsReport.r2Estimate.fileCount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Class A ops</span>
                <span className="tabular-nums">
                  {settingsReport.r2Estimate.classAOperations.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Class B ops</span>
                <span className="tabular-nums">
                  {settingsReport.r2Estimate.classBOperations.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="rounded-lg bg-muted/60 p-3 text-sm">
              <div className="flex items-center justify-between font-medium">
                <span>Estimated R2 total</span>
                <span className="tabular-nums">
                  {fmtCompact(settingsReport.r2Estimate.totalCostUsd, unit)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Uses R2 Standard pricing with the monthly free tier and rounded billing
                units. Storage includes ready workspace files and Wiki images and videos.
              </p>
            </div>
          </CardContent>
        </Card>
        )}

      </div>

      {byProject.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              By project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">{aiAmountLabel(unit)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProject.map((p) => (
                    <TableRow key={p.projectId}>
                      <TableCell>
                        <Link
                          href={`/projects/${p.projectSlug}/budget`}
                          className="hover:underline"
                        >
                          {p.projectTitle}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.requests.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(p.tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtCompact(p.spendUsd, unit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Per-user assistant usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byUser.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No assistant usage in this period.
            </p>
          ) : (
            <>
              <div className="space-y-3 sm:hidden">
                {byUser.map((u) => (
                  <UserUsageCard key={u.userId} user={u} range={range} unit={unit} />
                ))}
              </div>
              <div className="hidden overflow-x-auto sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">{aiAmountLabel(unit)}</TableHead>
                    <TableHead className="min-w-40">
                      {range === "month"
                        ? credits ? "% of monthly credits" : "% of monthly budget"
                        : credits ? "Monthly credits" : "Monthly budget"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byUser.map((u) => {
                    const pct =
                      u.budgetUsd > 0
                        ? Math.min(100, Math.round((u.spendUsd / u.budgetUsd) * 100))
                        : 0;
                    const over = range === "month" && u.spendUsd >= u.budgetUsd;
                    return (
                      <TableRow key={u.userId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserAvatar
                              name={u.name}
                              image={u.image}
                              size="sm"
                              className="size-7"
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{u.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {u.email}
                              </div>
                            </div>
                            {!u.enabled ? (
                              <Badge variant="outline">disabled</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {u.requests.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatTokens(u.tokens)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtCompact(u.spendUsd, unit)}
                        </TableCell>
                        <TableCell>
                          {range === "month" ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="tabular-nums text-muted-foreground">
                                  {pct}%
                                </span>
                                {over ? (
                                  <Badge variant="destructive">over</Badge>
                                ) : null}
                              </div>
                              <AnimatedBar
                                value={pct}
                                className={cn(
                                  pct >= 100 ? "bg-destructive" : "bg-primary"
                                )}
                                trackClassName="h-1.5"
                              />
                            </div>
                          ) : (
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {fmt(u.budgetUsd, unit)}/mo
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {credits
              ? "Per-user rows show each teammate's assistant use. Background/admin rows cover planner, imports, standups, and print email drafting."
              : "Per-user rows come from the assistant budget ledger. Background/admin rows cover planner, imports, standups, and print email drafting. Cloudflare values combine Workers AI usage with R2 storage and operation estimates."}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
