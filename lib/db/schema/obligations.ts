import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { projects } from "./projects";
import { rightsItems } from "./rights";
import { tasks } from "./tasks";
import { recurringTasks } from "./recurring";
import { obligationCadence, obligationKind } from "./enums";

/**
 * Standing license obligations extracted from a project's MoU/license — the
 * recurring or perpetual duties the team must honor to stay compliant (a breach
 * can terminate the license). Stored verbatim so producers see the exact
 * contractual language (e.g. a Khmer audio cue that must run in every episode,
 * or the © notice to attach wherever the work is published).
 *
 * `cadence` drives whether an obligation auto-generates an operational task:
 * periodic reports own a `recurringTasks` rule (`recurringTaskId`); `per_artwork`
 * owns one milestone gate task (`taskId`); the rest are production rules with
 * no task, surfaced on the Episodes/Overview/Rights surfaces.
 */
export const licenseObligations = pgTable(
  "license_obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Optional link to the project's rights record (for Rights-tab display).
    rightsItemId: uuid("rights_item_id").references(() => rightsItems.id, {
      onDelete: "set null",
    }),
    // Source clause, e.g. "2.2" or "§5" — for traceability back to the document.
    clauseRef: text("clause_ref"),
    kind: obligationKind("kind").notNull().default("other"),
    cadence: obligationCadence("cadence").notNull().default("standing"),
    // Null means use the cadence default; non-null was stated by the agreement
    // or deliberately entered by a manager.
    firstDueDate: date("first_due_date"),
    // Short human summary, e.g. "Khmer audio cue every episode".
    label: text("label").notNull(),
    // The exact contractual language, stored verbatim.
    text: text("text").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Set for monthly/quarterly/annual reports: the recurring task rule.
    recurringTaskId: uuid("recurring_task_id").references(
      () => recurringTasks.id,
      { onDelete: "set null" }
    ),
    // Set when cadence=per_artwork: the single milestone gate task.
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("license_obligations_project_idx").on(t.projectId)]
);
