import { or, sql } from "drizzle-orm";

import {
  documentImports,
  emailFollowUps,
  emailProjectSuggestions,
  emailProjectUpdateSuggestions,
  emailRightsReviews,
  emailThreads,
  printQuotes,
} from "@/lib/db/schema";

/** Shared decisions only. Personal task suggestions and owned watches stay in My Work. */
function reviewSignals(now: Date) {
  return [
    ["Project suggestions", sql`exists (select 1 from ${emailProjectSuggestions}
      where ${emailProjectSuggestions.threadId} = ${emailThreads.id}
      and ${emailProjectSuggestions.status} = 'pending')`],
    ["Project updates", sql`exists (select 1 from ${emailProjectUpdateSuggestions}
      where ${emailProjectUpdateSuggestions.threadId} = ${emailThreads.id}
      and ${emailProjectUpdateSuggestions.status} = 'pending')`],
    ["Rights documents", sql`exists (select 1 from ${emailRightsReviews}
      where ${emailRightsReviews.threadId} = ${emailThreads.id}
      and ${emailRightsReviews.status} in ('ready', 'failed'))`],
    ["Printer quotes", sql`exists (select 1 from ${printQuotes}
      where ${printQuotes.sourceThreadId} = ${emailThreads.id}
      and ${printQuotes.reviewStatus} = 'suggested')`],
    ["Funding documents", sql`exists (select 1 from ${documentImports}
      where ${documentImports.sourceThreadId} = ${emailThreads.id}
      and ${documentImports.status} in ('extracted', 'failed')
      and (${documentImports.extraction} is null or (
        ${documentImports.extraction}->>'documentKind' = 'agreement'
        and ${documentImports.extraction}->>'agreementType' <> 'license_only'
        and jsonb_path_exists(${documentImports.extraction}, '$.mouPaymentSchedule[*]')
      )))`],
    ["Unassigned follow-up", sql`exists (select 1 from ${emailFollowUps}
      where ${emailFollowUps.threadId} = ${emailThreads.id}
      and ${emailThreads.projectId} is not null
      and ${emailFollowUps.ownerUserId} is null
      and ${emailFollowUps.resolvedAt} is null
      and coalesce(${emailFollowUps.snoozedUntil}, ${emailFollowUps.dueAt})
        <= (${now.toISOString()}::timestamptz at time zone 'UTC'))`],
  ] as const;
}

/** Reused by the badge aggregate and inbox filter; one thread counts once. */
export function correspondenceNeedsReview(now = new Date()) {
  return or(...reviewSignals(now).map(([, condition]) => condition))!;
}

export function correspondenceReviewLabels(now = new Date()) {
  return sql<string[]>`array_remove(array[${sql.join(
    reviewSignals(now).map(([label, condition]) => sql`case when ${condition} then ${label} end`),
    sql`, `
  )}]::text[], null)`;
}
