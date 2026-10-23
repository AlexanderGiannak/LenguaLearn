import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { isLearned } from "@/lib/engine/cards";
import { getDb } from "@/lib/db/client";
import {
  activeTime,
  answerEvent,
  answerFlag,
  card,
  learnerProfile,
  senseProgress,
} from "@/lib/db/schema";
import { toCard } from "@/lib/train/store";

// Per-student numbers for teacher views. Only lib/teacher/scope.ts calls these, with the
// student IDs it has already scoped to the teacher's class (spec: shared teacher scope).
// The learner pages call countedMinutesByDay with the learner's own ID.
//
// A student in two classes shows the same practice in both: minutes are the student's
// training, not a class's.

type Window = { start: Date; end: Date };

export async function minutesByStudent(ids: string[], w: Window) {
  if (ids.length === 0) return new Map<string, { activeMs: number; flaggedMs: number }>();
  const db = getDb();
  const [active, flagged] = await Promise.all([
    // Time counts in the window where it happened, even if the session started earlier.
    db
      .select({
        userId: activeTime.userId,
        ms: sql<number>`coalesce(sum(${activeTime.ms}), 0)::int`,
      })
      .from(activeTime)
      .where(
        and(inArray(activeTime.userId, ids), gte(activeTime.at, w.start), lt(activeTime.at, w.end)),
      )
      .groupBy(activeTime.userId),
    // Flagged time is the counted time of answers in a flagged stretch (spec: Flagged time).
    db
      .select({
        userId: answerEvent.userId,
        ms: sql<number>`coalesce(sum(${answerEvent.activeMs}), 0)::int`,
      })
      .from(answerEvent)
      .innerJoin(answerFlag, eq(answerFlag.answerEventId, answerEvent.id))
      .where(
        and(
          inArray(answerEvent.userId, ids),
          gte(answerEvent.serverReceivedAt, w.start),
          lt(answerEvent.serverReceivedAt, w.end),
        ),
      )
      .groupBy(answerEvent.userId),
  ]);
  const out = new Map<string, { activeMs: number; flaggedMs: number }>();
  for (const id of ids) out.set(id, { activeMs: 0, flaggedMs: 0 });
  for (const a of active) out.get(a.userId)!.activeMs = a.ms;
  for (const f of flagged) out.get(f.userId)!.flaggedMs = f.ms;
  return out;
}

/**
 * Counted minutes (active minus flagged) per slice, summed over these students: the
 * minutes-per-day charts. Slices are consecutive (see weekDays).
 */
export async function countedMinutesByDay(ids: string[], slices: Window[]): Promise<number[]> {
  const out = slices.map(() => 0);
  if (ids.length === 0 || slices.length === 0) return out;
  const w = { start: slices[0]!.start, end: slices.at(-1)!.end };
  const db = getDb();
  const [active, flagged] = await Promise.all([
    db
      .select({ at: activeTime.at, ms: activeTime.ms })
      .from(activeTime)
      .where(
        and(inArray(activeTime.userId, ids), gte(activeTime.at, w.start), lt(activeTime.at, w.end)),
      ),
    db
      .select({ at: answerEvent.serverReceivedAt, ms: answerEvent.activeMs })
      .from(answerEvent)
      .innerJoin(answerFlag, eq(answerFlag.answerEventId, answerEvent.id))
      .where(
        and(
          inArray(answerEvent.userId, ids),
          gte(answerEvent.serverReceivedAt, w.start),
          lt(answerEvent.serverReceivedAt, w.end),
        ),
      ),
  ]);
  const slot = (at: Date) => slices.findIndex((s) => at >= s.start && at < s.end);
  for (const a of active) out[slot(a.at)]! += a.ms;
  for (const f of flagged) out[slot(f.at)]! -= f.ms;
  return out.map((ms) => Math.round(Math.max(0, ms) / 6000) / 10);
}

export async function accuracyByStudent(ids: string[], w: Window) {
  if (ids.length === 0) return new Map<string, { answered: number; correct: number }>();
  const rows = await getDb()
    .select({
      userId: answerEvent.userId,
      answered: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${answerEvent.correct})::int`,
    })
    .from(answerEvent)
    .where(
      and(
        inArray(answerEvent.userId, ids),
        eq(answerEvent.isPretest, false),
        gte(answerEvent.serverReceivedAt, w.start),
        lt(answerEvent.serverReceivedAt, w.end),
      ),
    )
    .groupBy(answerEvent.userId);
  return new Map(rows.map((r) => [r.userId, { answered: r.answered, correct: r.correct }]));
}

export async function lastActiveByStudent(ids: string[]) {
  if (ids.length === 0) return new Map<string, Date>();
  const rows = await getDb()
    .select({ userId: answerEvent.userId, at: sql<Date>`max(${answerEvent.serverReceivedAt})` })
    .from(answerEvent)
    .where(inArray(answerEvent.userId, ids))
    .groupBy(answerEvent.userId);
  return new Map(rows.map((r) => [r.userId, new Date(r.at)]));
}

/** Words learned now, words gained in the window, and words in progress, per student. */
export async function wordsByStudent(ids: string[], now: Date, w: Window) {
  const out = new Map<string, { learned: number; gained: number; inProgress: number }>();
  for (const id of ids) out.set(id, { learned: 0, gained: 0, inProgress: 0 });
  if (ids.length === 0) return out;
  const db = getDb();
  const [progress, cards] = await Promise.all([
    db.select().from(senseProgress).where(inArray(senseProgress.userId, ids)),
    db
      .select()
      .from(card)
      .where(and(inArray(card.userId, ids), eq(card.kind, "recognition"))),
  ]);
  const recognition = new Map(cards.map((c) => [`${c.userId}:${c.senseId}`, toCard(c)]));
  for (const p of progress) {
    const r = recognition.get(`${p.userId}:${p.senseId}`);
    const entry = out.get(p.userId)!;
    if (!r) continue;
    const learned = isLearned(
      { recognition: r, production: null, bestRecognitionPassDays: p.bestRecognitionPassDays },
      now,
    );
    if (learned) entry.learned += 1;
    else entry.inProgress += 1;
    if (p.firstLearnedAt && p.firstLearnedAt >= w.start && p.firstLearnedAt < w.end)
      entry.gained += 1;
  }
  return out;
}

export async function abilityByStudent(ids: string[]) {
  if (ids.length === 0) return new Map<string, { ability: number; startLevel: number }>();
  const rows = await getDb()
    .select()
    .from(learnerProfile)
    .where(inArray(learnerProfile.userId, ids));
  return new Map(rows.map((r) => [r.userId, { ability: r.ability, startLevel: r.startLevel }]));
}

/** Counted active time for one student over a window, for minutes per local day. */
export async function sessionsForStudent(id: string, w: Window) {
  return getDb()
    .select({ startedAt: activeTime.at, activeMs: activeTime.ms })
    .from(activeTime)
    .where(and(eq(activeTime.userId, id), gte(activeTime.at, w.start), lt(activeTime.at, w.end)));
}

/** The senses these students miss most, with how often and the most-chosen wrong answer. */
export async function mostMissed(ids: string[], w: Window, limit: number) {
  if (ids.length === 0) return [];
  const db = getDb();
  const scope = and(
    inArray(answerEvent.userId, ids),
    eq(answerEvent.isPretest, false),
    gte(answerEvent.serverReceivedAt, w.start),
    lt(answerEvent.serverReceivedAt, w.end),
  );
  const top = await db
    .select({
      senseId: answerEvent.senseId,
      missed: sql<number>`count(*) filter (where not ${answerEvent.correct})::int`,
      answered: sql<number>`count(*)::int`,
    })
    .from(answerEvent)
    .where(scope)
    .groupBy(answerEvent.senseId)
    .having(sql`count(*) filter (where not ${answerEvent.correct}) > 0`)
    .orderBy(desc(sql`count(*) filter (where not ${answerEvent.correct})`))
    .limit(limit);
  const chosenText = sql<
    string | null
  >`coalesce(${answerEvent.options} -> (${answerEvent.chosenIndex}::int) ->> 'text', ${answerEvent.typedText})`;
  return Promise.all(
    top.map(async (t) => {
      const [wrong] = await db
        .select({ text: chosenText, n: sql<number>`count(*)::int` })
        .from(answerEvent)
        .where(
          and(
            scope,
            eq(answerEvent.senseId, t.senseId),
            eq(answerEvent.correct, false),
            eq(answerEvent.dontKnow, false),
          ),
        )
        .groupBy(chosenText)
        .orderBy(desc(sql`count(*)`))
        .limit(1);
      return { ...t, topWrongAnswer: wrong?.text ?? null };
    }),
  );
}

/**
 * Integrity events for one student: each flagged stretch as one line, with its reason and
 * time. Shows the pattern; it never accuses.
 */
export async function integrityEvents(id: string, w: Window) {
  const rows = await getDb()
    .select({
      sessionId: answerEvent.studySessionId,
      reason: answerFlag.reason,
      at: sql<Date>`min(${answerEvent.serverReceivedAt})`,
      answers: sql<number>`count(*)::int`,
      ms: sql<number>`coalesce(sum(${answerEvent.activeMs}), 0)::int`,
    })
    .from(answerFlag)
    .innerJoin(answerEvent, eq(answerFlag.answerEventId, answerEvent.id))
    .where(
      and(
        eq(answerEvent.userId, id),
        gte(answerEvent.serverReceivedAt, w.start),
        lt(answerEvent.serverReceivedAt, w.end),
      ),
    )
    .groupBy(answerEvent.studySessionId, answerFlag.reason)
    .orderBy(desc(sql`min(${answerEvent.serverReceivedAt})`));
  return rows.map((r) => ({
    at: new Date(r.at).toISOString(),
    reason: r.reason,
    answers: r.answers,
    minutes: Math.round(r.ms / 6000) / 10,
  }));
}
