import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { classroom, demoAccount, seat, user } from "@/lib/db/schema";
import { seedFixtureContent } from "@/test/seed-content";
import {
  cleanupDemoAccounts,
  refillTeacherPool,
  startDemoLearner,
  startDemoTeacher,
} from "./service";

// A small class keeps these fast; the real demo uses DEMO_CONFIG.demoClass.
const SMALL = { students: 3, days: 2, minutesPerSession: 1 };
const HOUR = 3_600_000;
// Far from other test files' data: pool rows older than 12 hours count as stale, so
// anything they left behind is ignored here.
const T0 = new Date("2031-03-04T15:00:00Z");
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

beforeAll(async () => {
  await seedFixtureContent();
}, 60_000);

afterAll(async () => {
  await getSql().end();
});

async function readyTeachers(now: Date) {
  const rows = await getDb()
    .select({ userId: demoAccount.userId, createdAt: demoAccount.createdAt })
    .from(demoAccount)
    .where(and(eq(demoAccount.kind, "teacher"), isNull(demoAccount.claimedAt)));
  return rows.filter((r) => r.createdAt.getTime() > now.getTime() - 12 * HOUR);
}

describe("demo accounts", () => {
  it("makes a signed-in learner who still has to place, and records them as a demo", async () => {
    const res = await startDemoLearner(T0);
    expect(res.ok).toBe(true);
    expect(res.headers.getSetCookie().join(";")).toContain("session_token");
    const { user: created } = (await res.json()) as { user: { id: string } };
    const [u] = await getDb().select().from(user).where(eq(user.id, created.id));
    expect(u).toMatchObject({ role: "learner" });
    expect(u!.ageConfirmedAt).not.toBeNull();
    const [d] = await getDb().select().from(demoAccount).where(eq(demoAccount.userId, created.id));
    expect(d).toMatchObject({ kind: "learner" });
    expect(d!.claimedAt).toEqual(T0);
  });

  it("fills the teacher pool, and two visitors at once get different classes", async () => {
    await refillTeacherPool(() => T0, SMALL);
    expect(await readyTeachers(T0)).toHaveLength(2);

    const [a, b] = await Promise.all([startDemoTeacher(T0, SMALL), startDemoTeacher(T0, SMALL)]);
    expect(a.ok && b.ok).toBe(true);
    const ids = await Promise.all(
      [a, b].map(async (r) => ((await r.json()) as { user: { id: string } }).user.id),
    );
    expect(new Set(ids).size).toBe(2);
    expect(await readyTeachers(T0)).toHaveLength(0);
    const classes = await getDb().select().from(classroom).where(inArray(classroom.teacherId, ids));
    expect(classes).toHaveLength(2);
  }, 120_000);

  it("builds a class on the spot when the pool is empty or stale", async () => {
    // The pool from T0 is 13 hours old here, so it doesn't count.
    const res = await startDemoTeacher(at(13), SMALL);
    expect(res.ok).toBe(true);
    const { user: t } = (await res.json()) as { user: { id: string } };
    const [d] = await getDb().select().from(demoAccount).where(eq(demoAccount.userId, t.id));
    expect(d!.claimedAt).toEqual(at(13));
  }, 120_000);

  it("deletes demo accounts a day after they were claimed, with their classes and students", async () => {
    const claimed = await getDb()
      .select({ userId: demoAccount.userId })
      .from(demoAccount)
      .where(eq(demoAccount.kind, "teacher"));
    const teacherIds = claimed.map((c) => c.userId);
    const students = await getDb()
      .select({ id: seat.studentId })
      .from(seat)
      .innerJoin(classroom, eq(seat.classroomId, classroom.id))
      .where(inArray(classroom.teacherId, teacherIds));
    const studentIds = students.map((s) => s.id!).filter(Boolean);
    expect(studentIds.length).toBeGreaterThan(0);

    // 25 hours after T0: everything claimed at T0 has expired; the one claimed at +13h hasn't.
    await cleanupDemoAccounts(at(25));
    const left = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, [...teacherIds, ...studentIds]));
    const late = await getDb()
      .select({ userId: demoAccount.userId })
      .from(demoAccount)
      .where(eq(demoAccount.claimedAt, at(13)));
    const lateStudents = await getDb()
      .select({ id: seat.studentId })
      .from(seat)
      .innerJoin(classroom, eq(seat.classroomId, classroom.id))
      .where(eq(classroom.teacherId, late[0]!.userId));
    expect(new Set(left.map((u) => u.id))).toEqual(
      new Set([late[0]!.userId, ...lateStudents.map((s) => s.id!)]),
    );

    // A day after that, the last one goes too.
    await cleanupDemoAccounts(at(38));
    const none = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, [...teacherIds, ...studentIds]));
    expect(none).toHaveLength(0);
  }, 120_000);
});
