import { and, asc, eq, inArray, lte, max, ne, sql } from "drizzle-orm";
import { formatSeatCode, generateSeatCode } from "@/lib/auth/identifiers";
import { getDb } from "@/lib/db/client";
import { adminActionLog, classroom, seat, user } from "@/lib/db/schema";

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
