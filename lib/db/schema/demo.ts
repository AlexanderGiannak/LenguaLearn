import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Accounts made by the demo site's "Try it" buttons (DEMO_SITE=1 only). Teacher demos are
// built ahead of time into a small pool, because a class with a simulated week takes about
// half a minute; a visitor claims one. Every demo account is deleted a day after it is
// claimed, along with its class and students.
export const demoAccount = pgTable(
  "demo_account",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["learner", "teacher"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** When a visitor took this account. Null while a teacher demo waits in the pool. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [
    check("demo_account_kind", sql`${t.kind} IN ('learner', 'teacher')`),
    index("demo_account_pool_idx").on(t.kind, t.claimedAt),
  ],
);
