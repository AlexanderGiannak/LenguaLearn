import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { adminDeleteClass } from "@/lib/account/data";
import { signUp } from "@/lib/auth/accounts";
import { getAuth } from "@/lib/auth/auth";
import { generateHandle } from "@/lib/auth/identifiers";
import { getDb } from "@/lib/db/client";
import { classroom, demoAccount, user } from "@/lib/db/schema";
import { seedDemoClass } from "@/lib/teacher/demo";
import { DEMO_CONFIG } from "./config";

// The demo site's one-click accounts (spec-adjacent; see docs/DECISIONS.md). Callers check
// isDemoSite() first; nothing here runs on a site with demo mode off.

/** A new independent learner, signed in. They go to placement next, like any new learner. */
export async function startDemoLearner(now = new Date()): Promise<Response> {
  // The password is never shown: the session cookie is the visitor's only way in.
  const username = `${generateHandle()}-${randomBytes(2).toString("hex")}`;
  const res = await signUp({
    role: "learner",
    username,
    password: randomBytes(24).toString("base64url"),
    ageConfirmed: true,
  });
  const created = (await res.clone().json()) as { user: { id: string } };
  await getDb()
    .insert(demoAccount)
    .values({ userId: created.user.id, kind: "learner", createdAt: now, claimedAt: now });
  return res;
}

type ClassSize = { students: number; days: number; minutesPerSession: number };

async function buildTeacherDemo(claimedAt: Date | null, now: Date, size: ClassSize) {
  const demo = await seedDemoClass({ ...size, now });
  await getDb()
    .insert(demoAccount)
    .values({ userId: demo.teacherId, kind: "teacher", createdAt: now, claimedAt });
  return demo.teacherId;
}

/**
 * A teacher with a class of students and a simulated week, signed in. Taken from the pool
 * when one is ready; otherwise built now (about half a minute).
 */
export async function startDemoTeacher(
  now = new Date(),
  size: ClassSize = DEMO_CONFIG.demoClass,
): Promise<Response> {
  const fresh = new Date(now.getTime() - DEMO_CONFIG.unclaimedTtlMs);
  const claimed = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ userId: demoAccount.userId })
      .from(demoAccount)
      .where(
        and(
          eq(demoAccount.kind, "teacher"),
          isNull(demoAccount.claimedAt),
          gt(demoAccount.createdAt, fresh),
        ),
      )
      .orderBy(asc(demoAccount.createdAt))
      .limit(1)
      // Two visitors at once never get the same class.
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx.update(demoAccount).set({ claimedAt: now }).where(eq(demoAccount.userId, row.userId));
    return row.userId;
  });
  const teacherId = claimed ?? (await buildTeacherDemo(now, now, size));
  const [t] = await getDb().select({ email: user.email }).from(user).where(eq(user.id, teacherId));
  const res = await getAuth().api.signInEmail({
    body: { email: t!.email, password: "demo-teacher-password" },
    asResponse: true,
  });
  if (!res.ok) throw new Error(`demo teacher sign-in failed (${res.status})`);
  return res;
}

// One refill at a time: the server is single-instance, so an in-memory flag is enough.
let refilling: Promise<void> | null = null;

/** Tops the teacher pool back up to its size. Runs after the response is sent. */
export function refillTeacherPool(
  now = () => new Date(),
  size: ClassSize = DEMO_CONFIG.demoClass,
): Promise<void> {
  refilling ??= (async () => {
    try {
      for (;;) {
        const fresh = new Date(now().getTime() - DEMO_CONFIG.unclaimedTtlMs);
        const [row] = await getDb()
          .select({ ready: sql<number>`count(*)::int` })
          .from(demoAccount)
          .where(
            and(
              eq(demoAccount.kind, "teacher"),
              isNull(demoAccount.claimedAt),
              gt(demoAccount.createdAt, fresh),
            ),
          );
        if ((row?.ready ?? 0) >= DEMO_CONFIG.teacherPoolSize) return;
        await buildTeacherDemo(null, now(), size);
      }
    } finally {
      refilling = null;
    }
  })();
  return refilling;
}

/**
 * Deletes every demo account now, claimed or waiting in the pool: for switching a site's
 * demo mode off (the admin "purge_demo_accounts" action).
 */
export async function purgeAllDemoAccounts(): Promise<number> {
  // Far enough ahead that every claimed and unclaimed demo has expired.
  return cleanupDemoAccounts(new Date("9999-01-01T00:00:00Z"));
}

/**
 * Deletes demo accounts a day after they were claimed, and pool classes that went stale
 * unclaimed. A teacher's classes go with their students (including any visitor who joined
 * one with a seat code); then the teacher.
 */
export async function cleanupDemoAccounts(now = new Date()): Promise<number> {
  const db = getDb();
  const expired = await db
    .select({ userId: demoAccount.userId, kind: demoAccount.kind })
    .from(demoAccount)
    .where(
      or(
        lt(demoAccount.claimedAt, new Date(now.getTime() - DEMO_CONFIG.claimedTtlMs)),
        and(
          isNull(demoAccount.claimedAt),
          lt(demoAccount.createdAt, new Date(now.getTime() - DEMO_CONFIG.unclaimedTtlMs)),
        ),
      ),
    );
  for (const a of expired) {
    if (a.kind === "teacher") {
      const classes = await db
        .select({ id: classroom.id })
        .from(classroom)
        .where(eq(classroom.teacherId, a.userId));
      for (const c of classes) await adminDeleteClass(c.id, true);
    }
    await db.delete(user).where(eq(user.id, a.userId));
  }
  return expired.length;
}
