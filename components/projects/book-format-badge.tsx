import { BookOpen } from "lucide-react";

import {
  bookFormatBadgeInfo,
  type BookFormatEvidence,
} from "@/lib/projects/book-format";
import type { PrintFundingStatus } from "@/lib/projects/print-funding";
import { cn } from "@/lib/utils";

const TONE = {
  neutral: "border-border bg-background text-muted-foreground",
  info: "border-info/25 bg-info/8 text-info",
  warning: "border-warning/30 bg-warning/8 text-warning-text",
};

export function BookFormatBadge({
  evidence,
  printFundingStatus,
  compact = false,
}: {
  evidence: BookFormatEvidence;
  printFundingStatus: PrintFundingStatus;
  compact?: boolean;
}) {
  const info = bookFormatBadgeInfo(evidence, printFundingStatus);
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
      <BookOpen className="size-3.5" aria-hidden />
      {info.label}
    </span>
  );
}
