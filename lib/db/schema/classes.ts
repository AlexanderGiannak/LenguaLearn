import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { wordList } from "./content";

// Classes and seats (spec: Class student flow, Class settings). Named classroom because
// "class" reads badly in code. Every teacher query goes through lib/teacher/scope.ts.

export const classroom = pgTable(
  "classroom",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    weeklyGoalMinutes: integer("weekly_goal_minutes").notNull().default(45),
    /** Goals reset at this weekday (0 = Sunday) and time, in the class time zone. */
    weekResetDay: smallint("week_reset_day").notNull().default(0),
    weekResetTime: text("week_reset_time").notNull().default("23:59"),
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    sessionMinutes: integer("session_minutes").notNull().default(15),
    focusListId: integer("focus_list_id").references(() => wordList.id),
    // Grade formula (owner's default: 100% percent of goal).
    gradeGoalWeight: real("grade_goal_weight").notNull().default(1),
    gradeAccuracyWeight: real("grade_accuracy_weight").notNull().default(0),
    gradeFlaggedDeduction: real("grade_flagged_deduction").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("classroom_teacher_idx").on(t.teacherId),
    check("classroom_goal", sql`${t.weeklyGoalMinutes} BETWEEN 1 AND 10000`),
    check("classroom_session", sql`${t.sessionMinutes} BETWEEN 1 AND 60`),
  ],
);

export const seat = pgTable(
  "seat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classroom.id, { onDelete: "cascade" }),
    seatNumber: integer("seat_number").notNull(),
    studentId: text("student_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * The seat's current one-time code (join or reset), kept readable so the teacher can
     * re-download the CSV. Cleared once redeemed.
     */
    code: text("code").unique(),
    codeKind: text("code_kind", { enum: ["join", "reset"] }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("seat_classroom_number").on(t.classroomId, t.seatNumber),
    index("seat_student_idx").on(t.studentId),
    check("seat_number_positive", sql`${t.seatNumber} >= 1`),
    check("seat_code_kind", sql`(${t.code} IS NULL) = (${t.codeKind} IS NULL)`),
  ],
);

/** Record of admin and district deletion actions (spec: Deletion and export). */
export const adminActionLog = pgTable("admin_action_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  /** What was acted on, by internal ID only. */
  target: text("target").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
