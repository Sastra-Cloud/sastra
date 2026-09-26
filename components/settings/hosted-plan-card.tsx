import { HardDrive, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/hosted/storage";
import { cn } from "@/lib/utils";

type Props = {
  people: number;
  peopleLimit: number | null;
  usedBytes: number;
  limitBytes: number | null;
  accountUrl: string | null;
};

/** Sastra Cloud only: what the plan includes and how much the workspace uses. */
export function HostedPlanCard({ people, peopleLimit, usedBytes, limitBytes, accountUrl }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your plan</CardTitle>
        <CardDescription>
          What your Sastra Cloud plan includes. AI credits are in Settings ▸ AI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <UsageRow
          icon={Users}
          label="People"
          used={`${people}`}
          limit={peopleLimit === null ? null : `${peopleLimit}`}
          ratio={peopleLimit ? people / peopleLimit : null}
          note="Pending invitations count. People you remove do not."
        />
        <UsageRow
          icon={HardDrive}
          label="File space"
          used={formatBytes(usedBytes)}
          limit={limitBytes === null ? null : formatBytes(limitBytes)}
          ratio={limitBytes ? usedBytes / limitBytes : null}
          note="Files, imports, and wiki images and videos."
        />
        {accountUrl ? (
          <p className="text-sm">
            <a className="font-medium text-primary underline-offset-4 hover:underline" href={accountUrl}>
              Manage your plan
            </a>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UsageRow({
  icon: Icon,
  label,
  used,
  limit,
  ratio,
  note,
}: {
  icon: LucideIcon;
  label: string;
  used: string;
  limit: string | null;
  ratio: number | null;
  note: string;
}) {
  const percent = ratio === null ? null : Math.min(100, Math.round(ratio * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {limit === null ? `${used} (no limit)` : `${used} of ${limit}`}
        </span>
      </div>
      {percent !== null ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
              percent >= 90 ? "bg-destructive" : percent >= 80 ? "bg-amber-500" : "bg-primary"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
