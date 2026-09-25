import { CircleDollarSign } from "lucide-react";

import {
  projectFundingBadgeInfo,
  type ProjectFundingSummary,
  type PrintFundingStatus,
} from "@/lib/projects/print-funding";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: "border-border bg-muted/40 text-muted-foreground",
  warning: "border-warning/35 bg-warning/10 text-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-info/30 bg-info/10 text-info",
  success: "border-success/30 bg-success/10 text-success",
};

export function PrintFundingBadge({
  status,
  summary,
  compact = false,
}: {
  status: PrintFundingStatus;
  summary?: ProjectFundingSummary | null;
  compact?: boolean;
}) {
  const info = projectFundingBadgeInfo(status, summary);
  return (
    <span
      aria-label={`${info.label}. ${info.description}`}
      title={info.description}
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        compact ? "gap-1 px-2 py-0.5 text-xs" : "gap-1.5 px-2.5 py-1 text-xs",
        TONE[info.tone]
      )}
    >
      <CircleDollarSign className="size-3.5" aria-hidden />
      {compact ? info.compactLabel : info.label}
    </span>
  );
}
