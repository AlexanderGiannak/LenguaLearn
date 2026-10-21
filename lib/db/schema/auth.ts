import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Better Auth's tables (user, session, account, verification). TypeScript field names must
// match Better Auth's field names; columns are snake_case like the rest of the database.

export const ROLES = ["teacher", "student", "learner", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    // Better Auth requires a name and an email. A class student's name is their handle and
    // their email is a random placeholder at the reserved .invalid domain: neither comes
    // from the student, and the mailer refuses .invalid addresses.
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    username: text("username").unique(),
    displayUsername: text("display_username"),
    role: text("role", { enum: ROLES }).notNull().default("learner"),
    /** Independent learners confirm they are 13 or older at sign-up. */
    ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
    /** Class students left with no class are deleted 30 days later (spec: Deletion). */
    scheduledDeletionAt: timestamp("scheduled_deletion_at", { withTimezone: true }),
  },
  (t) => [
    check("user_role", sql`${t.role} IN ('teacher', 'student', 'learner', 'admin')`),
    // A class student never has a real email or a profile picture.
    check(
      "user_student_no_pii",
      sql`${t.role} <> 'student' OR (${t.email} LIKE '%@students.invalid' AND ${t.image} IS NULL)`,
    ),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Better Auth has these columns; the app never fills them (spec: IP addresses are not
    // stored; no browser fingerprinting). The check makes that a database guarantee.
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("session_user_idx").on(t.userId),
    check("session_no_ip_or_agent", sql`${t.ipAddress} IS NULL AND ${t.userAgent} IS NULL`),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
