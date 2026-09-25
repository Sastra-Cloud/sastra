import type { PrintFundingStatus } from "./print-funding";

export type BookFormatEvidence = {
  hasRightsRecord: boolean;
  formatPrint: boolean;
  formatEbook: boolean;
  hasPrintWorkflow: boolean;
};

export type BookFormatBadgeInfo = {
  label:
    | "Print + eBook planned"
    | "Print planned"
    | "eBook for now"
    | "eBook only"
    | "No print plan"
    | "Print plan not set"
    | "Format plan not set";
  description: string;
  tone: "neutral" | "info" | "warning";
};

function hasPrintIntent(status: PrintFundingStatus) {
  return (
    status === "no_funding" ||
    status === "seeking_funding" ||
    status === "partially_funded" ||
    status === "funded"
  );
}

/** Derive the current production plan without treating owned rights as intent. */
export function bookFormatBadgeInfo(
  evidence: BookFormatEvidence,
  printFundingStatus: PrintFundingStatus
): BookFormatBadgeInfo {
  const printPlanned =
    evidence.hasPrintWorkflow || hasPrintIntent(printFundingStatus);

  if (printPlanned && evidence.formatEbook) {
    return {
      label: "Print + eBook planned",
      description: evidence.formatPrint
        ? "The current plan includes printing and eBook distribution, and rights are recorded for both."
        : "The current plan includes printing and eBook distribution, but Print rights are not yet selected.",
      tone: evidence.formatPrint ? "info" : "warning",
    };
  }
  if (printPlanned) {
    return {
      label: "Print planned",
      description: evidence.formatPrint
        ? "The current plan includes printing, and Print rights are recorded."
        : "The current plan includes printing, but Print rights are not yet selected.",
      tone: evidence.formatPrint ? "neutral" : "warning",
    };
  }
  if (evidence.formatEbook && printFundingStatus === "not_required") {
    return {
      label: "eBook only",
      description: evidence.formatPrint
        ? "Printing is not currently planned. eBook rights are recorded, and Print rights remain available for later."
        : "Printing is not currently planned, and eBook rights are recorded.",
      tone: "info",
    };
  }
  if (evidence.formatEbook) {
    return {
      label: "eBook for now",
      description: evidence.formatPrint
        ? "eBook is the current plan. Print rights are available, but no print run, print budget, or print-funding decision is recorded. Set Print funding in Project settings if printing is intended."
        : "eBook is the current plan, and no print work or print-funding decision is recorded.",
      tone: "info",
    };
  }
  if (printFundingStatus === "not_required") {
    return {
      label: "No print plan",
      description:
        "Printing is not currently planned, and no eBook format is recorded.",
      tone: "neutral",
    };
  }
  if (evidence.formatPrint) {
    return {
      label: "Print plan not set",
      description:
        "Print rights are available, but no print run, print budget, or print-funding decision is recorded. Set Print funding in Project settings.",
      tone: "warning",
    };
  }
  return {
    label: "Format plan not set",
    description: evidence.hasRightsRecord
      ? "No current Print or eBook production plan can be determined."
      : "No Print or eBook rights record or production plan is available yet.",
    tone: "warning",
  };
}
