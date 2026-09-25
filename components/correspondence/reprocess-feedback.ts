import type { ReprocessEmailResult } from "@/lib/email/actions";

export type ReprocessFeedback = {
  title: string;
  description: string;
  tone: "success" | "info";
  destination: "thread-review" | "project-print" | null;
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinLabels(labels: string[]) {
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function describeReprocessResult(
  result: ReprocessEmailResult,
  scope: "email" | "thread"
): ReprocessFeedback {
  const subject = scope === "email" ? "Email" : "Thread";
  const threadResults = [
    result.projectUpdateSuggestionsCreated
      ? countLabel(
          result.projectUpdateSuggestionsCreated,
          "project status suggestion"
        )
      : null,
    result.taskSuggestionsCreated
      ? countLabel(result.taskSuggestionsCreated, "task suggestion")
      : null,
    result.rightsReviewsCreated
      ? countLabel(result.rightsReviewsCreated, "rights document review")
      : null,
    result.aiSuggestionCreated ? "an AI suggestion" : null,
  ].filter((label): label is string => !!label);
  const printResults = [
    result.quotesCreated
      ? countLabel(result.quotesCreated, "quote suggestion")
      : null,
    result.proofFilesStored
      ? countLabel(result.proofFilesStored, "restored print proof")
      : null,
  ].filter((label): label is string => !!label);

  if (threadResults.length || printResults.length) {
    const locations = [
      threadResults.length
        ? `${joinLabels(threadResults)} in the thread review area above.`
        : null,
      printResults.length
        ? `${joinLabels(printResults)} on the linked project's Print tab.`
        : null,
    ].filter((description): description is string => !!description);
    return {
      title: `${subject} reprocessed`,
      description: locations.join(" "),
      tone: "success",
      destination: threadResults.length ? "thread-review" : "project-print",
    };
  }

  if (result.printLinked) {
    return {
      title: `${subject} reprocessed`,
      description:
        "Matched existing print correspondence. No new review item was created.",
      tone: "info",
      destination: null,
    };
  }

  return {
    title: `${subject} reprocessed`,
    description: "No new matches or review items were found.",
    tone: "info",
    destination: null,
  };
}
