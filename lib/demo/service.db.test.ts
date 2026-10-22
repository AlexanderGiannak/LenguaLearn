import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { sentInDevelopment } from "@/lib/email/mailer";
import { signUp } from "@/lib/auth/accounts";
import { classroom, demoAccount, seat, user } from "@/lib/db/schema";
import { seedFixtureContent } from "@/test/seed-content";
import { DEMO_CONFIG } from "./config";
import {
  cleanupDemoAccounts,
  purgeAllDemoAccounts,
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
    const pool = DEMO_CONFIG.teacherPoolSize;
    expect(await readyTeachers(T0)).toHaveLength(pool);

    const [a, b] = await Promise.all([startDemoTeacher(T0, SMALL), startDemoTeacher(T0, SMALL)]);
    expect(a.ok && b.ok).toBe(true);
    const ids = await Promise.all(
      [a, b].map(async (r) => ((await r.json()) as { user: { id: string } }).user.id),
    );
    expect(new Set(ids).size).toBe(2);
    expect(await readyTeachers(T0)).toHaveLength(pool - 2);
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

  it("never tries to email a demo teacher", async () => {
    // Better Auth sends verification mail as a background task, so a failure there would
    // only log an error; once real email exists it would mail a made-up address.
    const before = sentInDevelopment.length;
    const res = await startDemoTeacher(at(13.5), SMALL);
    expect(res.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(sentInDevelopment.length).toBe(before);
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
      .where(inArray(demoAccount.claimedAt, [at(13), at(13.5)]));
    const lateIds = late.map((l) => l.userId);
    const lateStudents = await getDb()
      .select({ id: seat.studentId })
      .from(seat)
      .innerJoin(classroom, eq(seat.classroomId, classroom.id))
      .where(inArray(classroom.teacherId, lateIds));
    expect(new Set(left.map((u) => u.id))).toEqual(
      new Set([...lateIds, ...lateStudents.map((s) => s.id!)]),
    );

    // A day after that, the last one goes too.
    await cleanupDemoAccounts(at(38));
    const none = await getDb()
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, [...teacherIds, ...studentIds]));
    expect(none).toHaveLength(0);
  }, 120_000);

  it("purges every demo account at once, claimed or pooled, and nothing else", async () => {
    const learner = (await (await startDemoLearner(at(40))).json()) as { user: { id: string } };
    await refillTeacherPool(() => at(40), SMALL);
    const real = `real-${Date.now()}@example.com`;
    await signUp({ role: "teacher", name: "Real", email: real, password: "real-password-1" });

    expect(await purgeAllDemoAccounts()).toBeGreaterThan(DEMO_CONFIG.teacherPoolSize);
    expect(await getDb().select().from(demoAccount)).toHaveLength(0);
    expect(await getDb().select().from(user).where(eq(user.id, learner.user.id))).toHaveLength(0);
    expect(await getDb().select().from(user).where(eq(user.email, real))).toHaveLength(1);
  }, 120_000);
});
