import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { example, sense } from "./content";

// Learner progress and the answer log (spec: Scheduling, Answer event log). Every row
// belongs to a user and is deleted with the account.

/** Per-learner numbers: ability score and starting level. */
export const learnerProfile = pgTable("learner_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  ability: real("ability").notNull(),
  abilityAnswers: integer("ability_answers").notNull().default(0),
  startLevel: integer("start_level").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per student–sense pair. The two FSRS cards live in `card`. */
export const senseProgress = pgTable(
  "sense_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    bestRecognitionPassDays: real("best_recognition_pass_days").notNull().default(0),
    lastQuestionType: text("last_question_type"),
    introducedAt: timestamp("introduced_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the sense first met the "learned" rule (for "gained this week"). */
    firstLearnedAt: timestamp("first_learned_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.senseId] })],
);

/** An FSRS card. `kind` is recognition or production; columns mirror ts-fsrs's Card. */
export const card = pgTable(
  "card",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    kind: text("kind", { enum: ["recognition", "production"] }).notNull(),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    elapsedDays: real("elapsed_days").notNull(),
    scheduledDays: real("scheduled_days").notNull(),
    learningSteps: integer("learning_steps").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    state: smallint("state").notNull(),
    lastReview: timestamp("last_review", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.senseId, t.kind] }),
    index("card_user_due_idx").on(t.userId, t.due),
    check("card_kind", sql`${t.kind} IN ('recognition', 'production')`),
  ],
);

/** A training session. Named study_session because Better Auth owns `session`. */
export const studySession = pgTable(
  "study_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    plannedMinutes: integer("planned_minutes").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Active time counted so far, after the per-screen caps. */
    activeMs: integer("active_ms").notNull().default(0),
    /** The engine's session state (pending misses, second checks, counts). */
    state: jsonb("state").notNull(),
    audio: boolean("audio").notNull(),
  },
  (t) => [index("study_session_user_idx").on(t.userId, t.startedAt)],
);

/**
 * A question as issued, including its answer, so the server grades against what it sent and
 * never trusts the client. Single use: `answeredAt` is set once.
 */
export const issuedQuestion = pgTable(
  "issued_question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studySessionId: uuid("study_session_id")
      .notNull()
      .references(() => studySession.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** The answer's client ID and the response sent, so a retried answer gets the same reply. */
    clientAnswerId: uuid("client_answer_id").unique(),
    response: jsonb("response"),
  },
  (t) => [index("issued_question_session_idx").on(t.studySessionId)],
);

/**
 * Every graded answer, append-only (spec: Answer event log). A trigger in the migration
 * refuses updates other than clearing typed_text (the 90-day purge); rows are deleted only
 * with the account.
 */
export const answerEvent = pgTable(
  "answer_event",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    /** Client-generated ID: a retried answer is recognized and not counted twice. */
    clientAnswerId: uuid("client_answer_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    senseId: integer("sense_id")
      .notNull()
      .references(() => sense.id),
    exampleId: integer("example_id").references(() => example.id),
    studySessionId: uuid("study_session_id")
      .notNull()
      .references(() => studySession.id),
    questionType: text("question_type").notNull(),
    cardKind: text("card_kind"),
    /** Options in display order: { text, senseId } objects. */
    options: jsonb("options"),
    chosenIndex: smallint("chosen_index"),
    typedText: varchar("typed_text", { length: 40 }),
    dontKnow: boolean("dont_know").notNull().default(false),
    grade: text("grade").notNull(),
    gradeReason: text("grade_reason"),
    correct: boolean("correct").notNull(),
    /** FSRS rating 1–4, or null for a pretest that changes no card. */
    rating: smallint("rating"),
    isPretest: boolean("is_pretest").notNull().default(false),
    fsrsBefore: jsonb("fsrs_before"),
    fsrsAfter: jsonb("fsrs_after"),
    fsrsParamsVersion: text("fsrs_params_version").notNull(),
    clientResponseMs: integer("client_response_ms").notNull(),
    /** Active time counted for this answer's screens, after the per-screen cap. */
    activeMs: integer("active_ms").notNull().default(0),
    /** Minimum reading time for the question as shown (spec: Flagged time). */
    minReadingMs: integer("min_reading_ms"),
    /** Time from returning to a hidden tab to answering, if the tab was hidden mid-question. */
    hiddenReturnMs: integer("hidden_return_ms"),
    serverIssuedAt: timestamp("server_issued_at", { withTimezone: true }).notNull(),
    serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).notNull(),
    flagged: boolean("flagged").notNull().default(false),
    appVersion: text("app_version").notNull(),
  },
  (t) => [
    index("answer_event_user_idx").on(t.userId, t.serverReceivedAt),
    index("answer_event_sense_idx").on(t.senseId),
    check("answer_event_typed_len", sql`char_length(${t.typedText}) <= 40`),
  ],
);

/**
 * Integrity flags (spec: Flagged time). Kept apart from answer_event, which stays append-only:
 * a stretch can be flagged after its first answers were logged. Deleted with the answers.
 */
export const answerFlag = pgTable(
  "answer_flag",
  {
    answerEventId: bigint("answer_event_id", { mode: "number" })
      .primaryKey()
      .references(() => answerEvent.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: ["fast", "same_position", "hidden_tab"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("answer_flag_reason", sql`${t.reason} IN ('fast', 'same_position', 'hidden_tab')`)],
);
