import { and, asc, eq, inArray, lte, max, ne, sql } from "drizzle-orm";
import { formatSeatCode, generateSeatCode } from "@/lib/auth/identifiers";
import { getDb } from "@/lib/db/client";
import { adminActionLog, classroom, learnerProfile, seat, user } from "@/lib/db/schema";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { getTrainingContent } from "@/lib/train/content";
import { percentOfGoal, seatStatus, suggestedGrade, type GradeFormula } from "./grades";
import {
  abilityByStudent,
  accuracyByStudent,
  lastActiveByStudent,
  minutesByStudent,
  mostMissed,
  sessionsForStudent,
  wordsByStudent,
} from "./stats";
import { daysBetween, localDay, weekWindow } from "./week";

// The one place teacher data is read or changed (spec: "Every teacher query is scoped by
// teacher ID in one shared helper"). Every function takes the teacher's ID first and only
// ever touches that teacher's classes; anything else is "not found", so a teacher cannot
// even learn whether another teacher's class exists.

export class NotFound extends Error {
  constructor() {
    super("not found");
  }
}

export const MAX_SEATS = 40;
const DELETE_AFTER_DAYS = 30;

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function teacherScope(teacherId: string) {
  const db = getDb();

  async function ownedClass(classId: string, tx: Db | Tx = db) {
    const [row] = await tx
      .select()
      .from(classroom)
      .where(and(eq(classroom.id, classId), eq(classroom.teacherId, teacherId)));
    if (!row) throw new NotFound();
    return row;
  }

  async function ownedSeat(seatId: string, tx: Db | Tx = db) {
    const [row] = await tx
      .select({ seat })
      .from(seat)
      .innerJoin(classroom, eq(seat.classroomId, classroom.id))
      .where(and(eq(seat.id, seatId), eq(classroom.teacherId, teacherId)));
    if (!row) throw new NotFound();
    return row.seat;
  }

  async function newCodes(tx: Tx, classId: string, from: number, count: number) {
    if (count <= 0) return;
    await tx.insert(seat).values(
      Array.from({ length: count }, (_, i) => ({
        classroomId: classId,
        seatNumber: from + i,
        code: generateSeatCode(),
        codeKind: "join" as const,
      })),
    );
  }

  /** Students in these classes who have no seat anywhere else get deleted in 30 days. */
  async function scheduleOrphanDeletion(tx: Tx, studentIds: string[], excludingClassId?: string) {
    if (studentIds.length === 0) return;
    const elsewhere = await tx
      .select({ studentId: seat.studentId })
      .from(seat)
      .where(
        and(
          inArray(seat.studentId, studentIds),
          excludingClassId ? ne(seat.classroomId, excludingClassId) : sql`true`,
        ),
      );
    const keep = new Set(elsewhere.map((r) => r.studentId));
    const orphans = studentIds.filter((id) => !keep.has(id));
    if (orphans.length === 0) return;
    await tx
      .update(user)
      .set({ scheduledDeletionAt: new Date(Date.now() + DELETE_AFTER_DAYS * 86_400_000) })
      .where(and(inArray(user.id, orphans), eq(user.role, "student")));
  }

  async function seatStudents(classId: string) {
    return db
      .select({
        id: seat.id,
        seatNumber: seat.seatNumber,
        studentId: seat.studentId,
        handle: user.username,
      })
      .from(seat)
      .leftJoin(user, eq(seat.studentId, user.id))
      .where(eq(seat.classroomId, classId))
      .orderBy(asc(seat.seatNumber));
  }

  return {
    listClasses: () =>
      db
        .select({
          id: classroom.id,
          name: classroom.name,
          seats: sql<number>`(select count(*)::int from ${seat} where ${seat.classroomId} = ${classroom.id})`,
          joined: sql<number>`(select count(*)::int from ${seat} where ${seat.classroomId} = ${classroom.id} and ${seat.studentId} is not null)`,
        })
        .from(classroom)
        .where(eq(classroom.teacherId, teacherId))
        .orderBy(asc(classroom.createdAt)),

    getClass: (classId: string) => ownedClass(classId),

    async createClass(input: { name: string; seats: number }) {
      return db.transaction(async (tx) => {
        const [created] = await tx
          .insert(classroom)
          .values({ teacherId, name: input.name })
          .returning();
        await newCodes(tx, created!.id, 1, Math.min(input.seats, MAX_SEATS));
        return created!;
      });
    },

    /** Seats with codes and handles; never anything else about the students. */
    async listSeats(classId: string) {
      await ownedClass(classId);
      const rows = await db
        .select({
          id: seat.id,
          seatNumber: seat.seatNumber,
          code: seat.code,
          codeKind: seat.codeKind,
          joinedAt: seat.joinedAt,
          handle: user.username,
        })
        .from(seat)
        .leftJoin(user, eq(seat.studentId, user.id))
        .where(eq(seat.classroomId, classId))
        .orderBy(asc(seat.seatNumber));
      return rows.map((r) => ({ ...r, code: r.code ? formatSeatCode(r.code) : null }));
    },

    async addSeats(classId: string, count: number) {
      return db.transaction(async (tx) => {
        await ownedClass(classId, tx);
        // Serialize concurrent "add seats" for one class.
        await tx.execute(
          sql`select 1 from ${classroom} where ${classroom.id} = ${classId} for update`,
        );
        const [m] = await tx
          .select({ n: max(seat.seatNumber) })
          .from(seat)
          .where(eq(seat.classroomId, classId));
        await newCodes(tx, classId, (m?.n ?? 0) + 1, count);
      });
    },

    /** A new one-time code for a seat: a reset code if a student has joined, else a join code. */
    async resetSeat(seatId: string) {
      const s = await ownedSeat(seatId);
      const [updated] = await db
        .update(seat)
        .set({ code: generateSeatCode(), codeKind: s.studentId ? "reset" : "join" })
        .where(eq(seat.id, s.id))
        .returning({ code: seat.code, codeKind: seat.codeKind });
      return { code: formatSeatCode(updated!.code!), kind: updated!.codeKind! };
    },

    async removeSeat(seatId: string) {
      await db.transaction(async (tx) => {
        const s = await ownedSeat(seatId, tx);
        await tx.delete(seat).where(eq(seat.id, s.id));
        if (s.studentId) await scheduleOrphanDeletion(tx, [s.studentId]);
      });
    },

    async deleteClass(classId: string) {
      await db.transaction(async (tx) => {
        await ownedClass(classId, tx);
        const students = await tx
          .select({ id: seat.studentId })
          .from(seat)
          .where(and(eq(seat.classroomId, classId), sql`${seat.studentId} is not null`));
        await scheduleOrphanDeletion(
          tx,
          students.map((s) => s.id!),
          classId,
        );
        await tx.delete(classroom).where(eq(classroom.id, classId));
      });
    },

    async updateSettings(classId: string, patch: ClassSettingsPatch) {
      await ownedClass(classId);
      await db.update(classroom).set(patch).where(eq(classroom.id, classId));
    },

    /** The teacher overrides a student's starting level (spec: Class settings). */
    async setStartLevel(seatId: string, level: number) {
      const s = await ownedSeat(seatId);
      if (!s.studentId) throw new NotFound();
      await db
        .insert(learnerProfile)
        .values({
          userId: s.studentId,
          ability: ENGINE_CONFIG.ability.beginnerAbility,
          startLevel: level,
        })
        .onConflictDoUpdate({ target: learnerProfile.userId, set: { startLevel: level } });
    },

    /** One row per seat for a class week (spec: Dashboard). */
    async dashboard(classId: string, weekOffset = 0, now = new Date()) {
      const c = await ownedClass(classId);
      const week = weekWindow(now, weekSettings(c), weekOffset);
      const seats = await seatStudents(classId);
      const ids = seats.flatMap((s) => (s.studentId ? [s.studentId] : []));
      const [minutes, accuracy, lastActive, words, profiles] = await Promise.all([
        minutesByStudent(ids, week),
        accuracyByStudent(ids, week),
        lastActiveByStudent(ids),
        wordsByStudent(ids, now, week),
        abilityByStudent(ids),
      ]);
      const elapsed = Math.min(
        1,
        Math.max(0, daysBetween(week.start, now) / daysBetween(week.start, week.end)),
      );
      const rows = seats.map((s) => {
        if (!s.studentId) {
          return { seatId: s.id, seatNumber: s.seatNumber, handle: null, joined: false as const };
        }
        const m = minutes.get(s.studentId)!;
        const a = accuracy.get(s.studentId);
        const w = words.get(s.studentId)!;
        const flaggedMinutes = m.flaggedMs / 60_000;
        const mins = Math.max(0, m.activeMs - m.flaggedMs) / 60_000;
        return {
          seatId: s.id,
          seatNumber: s.seatNumber,
          handle: s.handle,
          joined: true as const,
          minutes: round1(mins),
          flaggedMinutes: round1(flaggedMinutes),
          accuracy: a?.answered ? Math.round((100 * a.correct) / a.answered) : null,
          learned: w.learned,
          gained: w.gained,
          lastActive: lastActive.get(s.studentId)?.toISOString() ?? null,
          startLevel: profiles.get(s.studentId)?.startLevel ?? 1,
          status: seatStatus({
            minutes: mins,
            flaggedMinutes,
            goalMinutes: c.weeklyGoalMinutes,
            weekElapsed: weekOffset < 0 ? 1 : elapsed,
            activeThisWeek: (a?.answered ?? 0) > 0 || m.activeMs > 0,
          }),
        };
      });
      const joined = rows.filter((r) => r.joined);
      const answered = [...accuracy.values()].reduce((n, a) => n + a.answered, 0);
      const correct = [...accuracy.values()].reduce((n, a) => n + a.correct, 0);
      return {
        class: {
          id: c.id,
          name: c.name,
          weeklyGoalMinutes: c.weeklyGoalMinutes,
          timeZone: c.timeZone,
        },
        week: { start: week.start.toISOString(), end: week.end.toISOString(), offset: weekOffset },
        summary: {
          students: joined.length,
          onTrack: joined.filter((r) => r.status === "on_track").length,
          medianMinutes: median(joined.map((r) => r.minutes)),
          accuracy: answered ? Math.round((100 * correct) / answered) : null,
        },
        rows,
      };
    },

    /** One student's page (spec: Student detail). */
    async studentDetail(classId: string, seatId: string, now = new Date()) {
      const c = await ownedClass(classId);
      const s = await ownedSeat(seatId);
      if (s.classroomId !== classId || !s.studentId) throw new NotFound();
      const id = s.studentId;
      const fourWeeks = { start: new Date(now.getTime() - 28 * 86_400_000), end: now };
      const [sessions, words, profile, missed, handleRow] = await Promise.all([
        sessionsForStudent(id, fourWeeks),
        wordsByStudent([id], now, weekWindow(now, weekSettings(c))),
        abilityByStudent([id]),
        mostMissed([id], { start: new Date(0), end: now }, 10),
        db.select({ handle: user.username }).from(user).where(eq(user.id, id)),
      ]);
      const perDay = new Map<string, number>();
      for (let d = 27; d >= 0; d--)
        perDay.set(localDay(new Date(now.getTime() - d * 86_400_000), c.timeZone), 0);
      for (const ses of sessions) {
        const day = localDay(ses.startedAt, c.timeZone);
        if (perDay.has(day)) perDay.set(day, perDay.get(day)! + ses.activeMs / 60_000);
      }
      const weeks = [];
      for (let o = -3; o <= 0; o++) {
        const w = weekWindow(now, weekSettings(c), o);
        const a = (await accuracyByStudent([id], w)).get(id);
        weeks.push({
          start: w.start.toISOString(),
          accuracy: a?.answered ? Math.round((100 * a.correct) / a.answered) : null,
        });
      }
      const content = await getTrainingContent();
      const p = profile.get(id);
      const w = words.get(id)!;
      return {
        seatNumber: s.seatNumber,
        handle: handleRow[0]?.handle ?? null,
        minutesPerDay: [...perDay].map(([day, minutes]) => ({ day, minutes: round1(minutes) })),
        accuracyByWeek: weeks,
        level: p ? levelFromAbility(p.ability, p.startLevel) : 1,
        learned: w.learned,
        inProgress: w.inProgress,
        mostMissed: missed.map((m) => ({
          display: content.core.get(m.senseId)?.display ?? "(retired word)",
          gloss: content.core.get(m.senseId)?.gloss ?? "",
          missed: m.missed,
          answered: m.answered,
        })),
        // Integrity events arrive with Phase 6.
        integrityEvents: [] as { at: string; reason: string }[],
      };
    },

    /** The words this class misses most, with each one's most-chosen wrong answer. */
    async insights(classId: string, now = new Date()) {
      await ownedClass(classId);
      const seats = await seatStudents(classId);
      const ids = seats.flatMap((s) => (s.studentId ? [s.studentId] : []));
      const missed = await mostMissed(
        ids,
        { start: new Date(now.getTime() - 28 * 86_400_000), end: now },
        15,
      );
      const content = await getTrainingContent();
      return missed.map((m) => ({
        senseId: m.senseId,
        display: content.core.get(m.senseId)?.display ?? "(retired word)",
        gloss: content.core.get(m.senseId)?.gloss ?? "",
        missed: m.missed,
        answered: m.answered,
        topWrongAnswer: m.topWrongAnswer,
      }));
    },

    /** Grade rows for a date range (spec: Grade export). The goal is prorated by length. */
    async gradeRows(classId: string, range: { start: Date; end: Date }, formula?: GradeFormula) {
      const c = await ownedClass(classId);
      const f = formula ?? {
        goalWeight: c.gradeGoalWeight,
        accuracyWeight: c.gradeAccuracyWeight,
        flaggedDeduction: c.gradeFlaggedDeduction,
      };
      const seats = await seatStudents(classId);
      const ids = seats.flatMap((s) => (s.studentId ? [s.studentId] : []));
      const [minutes, accuracy] = await Promise.all([
        minutesByStudent(ids, range),
        accuracyByStudent(ids, range),
      ]);
      const goal = round1(c.weeklyGoalMinutes * (daysBetween(range.start, range.end) / 7));
      return {
        formula: f,
        goalMinutes: goal,
        rows: seats
          .filter((s) => s.studentId)
          .map((s) => {
            const m = minutes.get(s.studentId!)!;
            const a = accuracy.get(s.studentId!);
            const mins = round1(Math.max(0, m.activeMs - m.flaggedMs) / 60_000);
            const flagged = round1(m.flaggedMs / 60_000);
            const acc = a?.answered ? Math.round((100 * a.correct) / a.answered) : null;
            return {
              seat: s.seatNumber,
              handle: s.handle!,
              minutes: mins,
              goal,
              percentOfGoal: percentOfGoal(mins, goal),
              accuracy: acc,
              flaggedMinutes: flagged,
              suggestedGrade: suggestedGrade(
                { minutes: mins, goalMinutes: goal, accuracy: acc, flaggedMinutes: flagged },
                f,
              ),
            };
          }),
      };
    },

    /** CSV of seats and codes with a blank name column the teacher fills in themselves. */
    async seatsCsv(classId: string) {
      const c = await ownedClass(classId);
      const seats = await this.listSeats(classId);
      // Spec columns. The name column stays blank; the app never sees it.
      const lines = ["seat,code,student name"];
      for (const s of seats) lines.push(`${s.seatNumber},${s.code ?? ""},`);
      return {
        filename: `${c.name.replace(/[^\w-]+/g, "_")}-seats.csv`,
        csv: `${lines.join("\n")}\n`,
      };
    },
  };
}

/** Deletes class students whose 30-day grace period has passed. Run nightly (Phase 10). */
export async function purgeScheduledDeletions(now = new Date()): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "student"), lte(user.scheduledDeletionAt, now)));
    if (due.length === 0) return 0;
    // A student who joined another class since is no longer an orphan.
    const seated = await tx
      .select({ id: seat.studentId })
      .from(seat)
      .where(
        inArray(
          seat.studentId,
          due.map((d) => d.id),
        ),
      );
    const keep = new Set(seated.map((s) => s.id));
    const ids = due.map((d) => d.id).filter((id) => !keep.has(id));
    if (ids.length > 0) {
      await tx.delete(user).where(inArray(user.id, ids));
      await tx.insert(adminActionLog).values({
        action: "purge_scheduled_students",
        target: `${ids.length} accounts`,
      });
    }
    if (keep.size > 0) {
      await tx
        .update(user)
        .set({ scheduledDeletionAt: null })
        .where(inArray(user.id, [...keep] as string[]));
    }
    return ids.length;
  });
}

export type ClassSettingsPatch = Partial<{
  name: string;
  weeklyGoalMinutes: number;
  weekResetDay: number;
  weekResetTime: string;
  timeZone: string;
  sessionMinutes: number;
  focusListId: number | null;
  gradeGoalWeight: number;
  gradeAccuracyWeight: number;
  gradeFlaggedDeduction: number;
}>;

function weekSettings(c: { weekResetDay: number; weekResetTime: string; timeZone: string }) {
  return { resetDay: c.weekResetDay, resetTime: c.weekResetTime, timeZone: c.timeZone };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : round1((s[mid - 1]! + s[mid]!) / 2);
}

/** A level from the ability score (log of a frequency rank), never below the starting level. */
export function levelFromAbility(ability: number, startLevel: number): number {
  const rank = Math.exp(ability);
  return Math.max(startLevel, Math.floor(Math.max(0, rank - 1) / ENGINE_CONFIG.levelBandSize) + 1);
}
