import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chatChannels } from "./chat";
import { standupRunStatus } from "./enums";

/** A team-wide daily standup definition. */
export const standups = pgTable("standups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  scheduleTime: text("schedule_time").notNull().default("09:00"), // local HH:mm
  scheduleDays: smallint("schedule_days").array().notNull().default([1, 2, 3, 4, 5]), // 0=Sun..6=Sat
  timezone: text("timezone").notNull().default("UTC"),
  reminderAfterMinutes: integer("reminder_after_minutes"),
  reportToUserId: text("report_to_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const standupQuestions = pgTable("standup_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  standupId: uuid("standup_id")
    .notNull()
    .references(() => standups.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const standupParticipants = pgTable(
  "standup_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    standupId: uuid("standup_id")
      .notNull()
      .references(() => standups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    timezone: text("timezone"),
  },
  (t) => [uniqueIndex("standup_participants_unique").on(t.standupId, t.userId)]
);

export const standupRuns = pgTable(
  "standup_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    standupId: uuid("standup_id")
      .notNull()
      .references(() => standups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => chatChannels.id, {
      onDelete: "set null",
    }),
    runDate: date("run_date").notNull(),
    status: standupRunStatus("status").notNull().default("in_progress"),
    currentQuestionIndex: integer("current_question_index").notNull().default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    remindedAt: timestamp("reminded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("standup_runs_unique").on(t.standupId, t.userId, t.runDate)]
);

export const standupAnswers = pgTable("standup_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => standupRuns.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").references(() => standupQuestions.id, {
    onDelete: "set null",
  }),
  content: text("content").notNull(),
  answeredAt: timestamp("answered_at").defaultNow().notNull(),
});

export const standupReports = pgTable(
  "standup_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    standupId: uuid("standup_id")
      .notNull()
      .references(() => standups.id, { onDelete: "cascade" }),
    runDate: date("run_date").notNull(),
    summary: jsonb("summary").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("standup_reports_unique").on(t.standupId, t.runDate)]
);
