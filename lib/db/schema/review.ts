import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { pseudoword, sense } from "./content";

export const REVIEW_ACTIONS = ["edit", "approve", "reject", "publish"] as const;
export const reviewAction = pgEnum("review_action", REVIEW_ACTIONS);

/**
 * Every action in the review tool: who edited, approved, rejected or published which sense
 * or pseudoword, and why (a rejection's reason). Content only; reviewers are adult
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
