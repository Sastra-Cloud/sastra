export const PRINT_FUNDING_STATUSES = [
  "not_assessed",
  "no_funding",
  "seeking_funding",
  "partially_funded",
  "funded",
  "not_required",
] as const;

export type PrintFundingStatus = (typeof PRINT_FUNDING_STATUSES)[number];

export type ProjectFundingSummary = {
  needed: number;
  committed: number;
  received: number;
  spent: number;
  printNeeded: number;
  printSecured: number;
  currency: string;
};

export type ProjectFundingBadgeInfo = {
  label: string;
  compactLabel: string;
  description: string;
  tone: "neutral" | "warning" | "danger" | "info" | "success";
};

export const PRINT_FUNDING_LABELS: Record<PrintFundingStatus, string> = {
  not_assessed: "Print decision not set",
  no_funding: "Print planned · no funding",
  seeking_funding: "Seeking print funding",
  partially_funded: "Print partly funded",
  funded: "Print fully funded",
  not_required: "No printing planned yet",
};

export const PRINT_FUNDING_DESCRIPTIONS: Record<PrintFundingStatus, string> = {
  not_assessed: "The team has not decided whether this project will be printed.",
  no_funding:
    "Printing is planned, but no money is currently promised for the print run.",
  seeking_funding: "Funding is being pursued, but none is promised yet.",
  partially_funded: "Some printing costs are covered by promised funding; a gap remains.",
  funded: "All expected printing costs are covered by promised funding, whether or not the money has been received yet.",
  not_required:
    "Printing is not part of the current plan. Choose another status later if that changes.",
};

export const PRINT_FUNDING_FILTERS = [
  "all",
  "needs_review",
  ...PRINT_FUNDING_STATUSES,
] as const;

export type PrintFundingFilter = (typeof PRINT_FUNDING_FILTERS)[number];

export const PRINT_FUNDING_FILTER_LABELS: Record<PrintFundingFilter, string> = {
  all: "All print funding",
  needs_review: "Needs funding review",
  ...PRINT_FUNDING_LABELS,
};

export function isBookProjectKind(kind: string | null | undefined) {
  return kind == null || kind === "book";
}

export function isPrintFundingStatus(value: string | null): value is PrintFundingStatus {
  return PRINT_FUNDING_STATUSES.includes(value as PrintFundingStatus);
}

export function isPrintFundingFilter(value: string | null): value is PrintFundingFilter {
  return PRINT_FUNDING_FILTERS.includes(value as PrintFundingFilter);
}

export function needsPrintFundingReview(status: PrintFundingStatus) {
  return status !== "funded" && status !== "not_required";
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

/**
 * Prefer deliberate print-specific decisions. Until one is recorded, use the
 * project's budget, promises, and receipts so the default badge does not hide
 * stronger financial evidence.
 */
export function projectFundingBadgeInfo(
  status: PrintFundingStatus,
  summary: ProjectFundingSummary | null | undefined
): ProjectFundingBadgeInfo {
  if (status !== "not_assessed") {
    const tone: ProjectFundingBadgeInfo["tone"] =
      status === "no_funding"
        ? "danger"
        : status === "seeking_funding"
          ? "warning"
          : status === "partially_funded"
            ? "info"
            : status === "funded"
              ? "success"
              : "neutral";
    return {
      label: PRINT_FUNDING_LABELS[status],
      compactLabel: PRINT_FUNDING_LABELS[status],
      description: PRINT_FUNDING_DESCRIPTIONS[status],
      tone,
    };
  }

  if (!summary) {
    return {
      label: "Funding unknown",
      compactLabel: "Funding unknown",
      description:
        "No project-funding totals are available, and print funding has not been set.",
      tone: "warning",
    };
  }

  const { needed, committed, received, printNeeded, printSecured, currency } =
    summary;
  const printPromised = percent(printSecured, printNeeded);
  if (printNeeded > 0) {
    if (printSecured > 0) {
      if (printSecured < printNeeded) {
        return {
          label: `Print ${printPromised}% promised`,
          compactLabel: `Print ${printPromised}% promised`,
          description: `${money(printSecured, currency)} of the ${money(printNeeded, currency)} print budget is assigned as promised funding.`,
          tone: "info",
        };
      }
      return {
        label: "Print fully promised",
        compactLabel: "Print fully promised",
        description: `The ${money(printNeeded, currency)} print budget is fully covered by funding assigned to the Print / Ship line.`,
        tone: "success",
      };
    }

    if (needed > 0 && Math.max(committed, received) >= needed) {
      const fullyReceived = received >= needed;
      return {
        label: fullyReceived
          ? "Print covered · received"
          : "Print covered · promised",
        compactLabel: fullyReceived
          ? "Print covered · received"
          : "Print covered · promised",
        description: fullyReceived
          ? `The full ${money(needed, currency)} project budget has been received, including ${money(printNeeded, currency)} budgeted for printing.`
          : `The full ${money(needed, currency)} project budget is promised, including ${money(printNeeded, currency)} budgeted for printing; ${money(received, currency)} has been received.`,
        tone: "success",
      };
    }

    if (committed > 0 || received > 0) {
      return {
        label: "Print funding not assigned",
        compactLabel: "Print not assigned",
        description: `${money(Math.max(committed, received), currency)} in project funding is recorded, but none is assigned to the ${money(printNeeded, currency)} print budget. Set Funding assigned on the Print / Ship line or choose an explicit print status in Project settings.`,
        tone: "warning",
      };
    }

    return {
      label: "Print funding needed",
      compactLabel: "Print funding needed",
      description: `${money(printNeeded, currency)} is budgeted for printing, but no project or print-line funding is recorded.`,
      tone: "danger",
    };
  }

  if (needed <= 0) {
    if (committed > 0 || received > 0) {
      return {
        label: "Project funding recorded",
        compactLabel: "Project funding recorded",
        description: `${money(Math.max(committed, received), currency)} is recorded, but there is no project budget to compare it with. Print funding has not been set separately.`,
        tone: "info",
      };
    }
    return {
      label: "Funding unknown",
      compactLabel: "Funding unknown",
      description:
        "No project budget or funding is recorded, and print funding has not been set separately.",
      tone: "warning",
    };
  }

  if (committed <= 0) {
    return {
      label: "No project funding recorded",
      compactLabel: "No project funding",
      description: `The project budget is ${money(needed, currency)}, but no promised or received funding is recorded.`,
      tone: "danger",
    };
  }

  const promisedPercent = percent(committed, needed);
  const receivedPercent = percent(received, needed);
  if (committed < needed) {
    return {
      label: `Project ${promisedPercent}% promised`,
      compactLabel: `Project ${promisedPercent}% promised`,
      description: `${money(committed, currency)} is promised toward the ${money(needed, currency)} project budget; ${money(received, currency)} has been received. Print funding has not been set separately.`,
      tone: "info",
    };
  }

  if (received >= needed) {
    return {
      label: "Project funding fully received",
      compactLabel: "Project fully received",
      description: `${money(received, currency)} has been received against the ${money(needed, currency)} project budget. Print funding has not been set separately.`,
      tone: "success",
    };
  }

  if (received > 0) {
    return {
      label: `Project fully promised · ${receivedPercent}% received`,
      compactLabel: `Project promised · ${receivedPercent}% received`,
      description: `${money(committed, currency)} is promised for the ${money(needed, currency)} project budget; ${money(received, currency)} has been received. Print funding has not been set separately.`,
      tone: "success",
    };
  }

  return {
    label: "Project funding fully promised",
    compactLabel: "Project fully promised",
    description: `${money(committed, currency)} is promised for the ${money(needed, currency)} project budget; none is recorded as received yet. Print funding has not been set separately.`,
    tone: "success",
  };
}

export function matchesPrintFundingFilter(
  kind: string | null,
  status: PrintFundingStatus,
  filter: PrintFundingFilter
) {
  if (filter === "all") return true;
  if (!isBookProjectKind(kind)) return false;
  if (filter === "needs_review") return needsPrintFundingReview(status);
  return status === filter;
}

const PRINT_FUNDING_SORT_RANK: Record<PrintFundingStatus, number> = {
  not_assessed: 0,
  no_funding: 1,
  seeking_funding: 2,
  partially_funded: 3,
  funded: 4,
  not_required: 5,
};

export function comparePrintFunding(
  a: { kind: string | null; printFundingStatus: PrintFundingStatus },
  b: { kind: string | null; printFundingStatus: PrintFundingStatus }
) {
  const aRank = isBookProjectKind(a.kind)
    ? PRINT_FUNDING_SORT_RANK[a.printFundingStatus]
    : Number.MAX_SAFE_INTEGER;
  const bRank = isBookProjectKind(b.kind)
    ? PRINT_FUNDING_SORT_RANK[b.printFundingStatus]
    : Number.MAX_SAFE_INTEGER;
  return aRank - bRank;
}
