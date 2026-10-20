import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { correspondenceNeedsReview, correspondenceReviewLabels } from "./review-queue";

const now = new Date("2026-10-20T01:00:00Z");

describe("shared email review signals", () => {
  it("uses durable source states and never notification read state or mailbox arrival", () => {
    const query = new PgDialect().sqlToQuery(correspondenceNeedsReview(now));
    expect(query.sql).toContain('"email_project_suggestions"."status" = \'pending\'');
    expect(query.sql).toContain('"email_project_update_suggestions"."status" = \'pending\'');
    expect(query.sql).toContain("in ('ready', 'failed')");
    expect(query.sql).toContain('"print_quotes"."review_status" = \'suggested\'');
    expect(query.sql).not.toContain('"notifications"');
    expect(query.sql).not.toContain('"email_task_suggestions"');
  });

  it("only brings unresolved, unowned due follow-ups into the shared queue", () => {
    const query = new PgDialect().sqlToQuery(correspondenceNeedsReview(now));
    expect(query.sql).toContain('"email_follow_ups"."owner_user_id" is null');
    expect(query.sql).toContain('"email_follow_ups"."resolved_at" is null');
    expect(query.sql).toContain('coalesce("email_follow_ups"."snoozed_until", "email_follow_ups"."due_at")');
    expect(query.sql).toContain("at time zone 'UTC'");
    expect(query.params).toContain(now.toISOString());
  });

  it("gives the list the same source predicates as the badge, with plain review labels", () => {
    const query = new PgDialect().sqlToQuery(correspondenceReviewLabels(now));
    expect(query.params).toEqual([
      "Project suggestions", "Project updates", "Rights documents", "Printer quotes", "Funding documents", now.toISOString(), "Unassigned follow-up",
    ]);
    expect(query.sql).toContain('"document_imports"."status" in (\'extracted\', \'failed\')');
    expect(query.sql).toContain("jsonb_path_exists");
  });
});
