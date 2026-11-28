import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { REPORT_REASONS } from "@/lib/review/report-reasons";
import { user } from "./auth";
import { pseudoword, sense } from "./content";

export const REVIEW_ACTIONS = [
  "edit",
  "approve",
  "reject",
  "publish",
  "flag_audio",
  "reject_image",
  "resolve_reports",
  "resolve_flags",
] as const;
export const reviewAction = pgEnum("review_action", REVIEW_ACTIONS);

/**
 * Every action in the review tool: who edited, approved, rejected or published which sense
 * or pseudoword, flagged a recording or rejected a picture, and why (a rejection's or flag's reason). Content only; reviewers are adult
 * volunteers or the admin, never students.
 */
export const reviewLog = pgTable(
  "review_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    // Kept when a reviewer deletes their account, without saying who it was.
    reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "set null" }),
    senseId: integer("sense_id").references(() => sense.id),
    pseudowordId: integer("pseudoword_id").references(() => pseudoword.id),
    action: reviewAction("action").notNull(),
    reason: text("reason"),
  },
  (t) => [
    index("review_log_sense_idx").on(t.senseId, t.at),
    check("review_log_one_target", sql`num_nonnulls(${t.senseId}, ${t.pseudowordId}) = 1`),
  ],
);

export const reportReason = pgEnum("report_reason", REPORT_REASONS);

/**
 * A learner's "Report a problem" on a question. Who sent it is kept only to count distinct
 * reporters and to delete it with their account; reviewers never see it (owner,
 * 2026-11-26). The optional text is the learner's own words: capped, never sent to an AI.
 */
export const contentReport = pgTable(
  "content_report",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: reportReason("reason").notNull(),
    text: varchar("text", { length: 300 }),
    /** The question type it was reported from, so the reviewer can see it. */
    questionType: text("question_type"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    // One open report per learner per sense: a pause needs several different people.
    uniqueIndex("content_report_open_once")
      .on(t.senseId, t.reporterId)
      .where(sql`${t.resolvedAt} is null`),
    index("content_report_reporter_idx").on(t.reporterId, t.at),
    check("content_report_text_len", sql`char_length(${t.text}) <= 300`),
  ],
);

export const STAT_FLAG_KINDS = ["low_accuracy", "distractor_magnet", "slow"] as const;
export const statFlagKind = pgEnum("stat_flag_kind", STAT_FLAG_KINDS);

/**
 * A flag from the nightly stats job (spec: Content pipeline, step 5): a sense whose answers
 * look unusual. Totals only (accuracy, shares, times), never anything about one learner.
 */
export const contentFlag = pgTable(
  "content_flag",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    kind: statFlagKind("kind").notNull(),
    /** The numbers behind the flag, as the job saw them on its last run. */
    detail: jsonb("detail").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("content_flag_open_once")
      .on(t.senseId, t.kind)
      .where(sql`${t.resolvedAt} is null`),
    index("content_flag_sense_idx").on(t.senseId, t.resolvedAt),
  ],
);
