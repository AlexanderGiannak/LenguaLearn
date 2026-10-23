import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  activeTime,
  answerEvent,
  answerFlag,
  card,
  classroom,
  seat,
  senseProgress,
  vocabSnapshot,
} from "@/lib/db/schema";
import { estimateVocabularySize } from "@/lib/engine/ability";
import { isLearned, recall } from "@/lib/engine/cards";
import { countedMinutesByDay } from "@/lib/teacher/stats";
import { localDay, streakDays, weekDays, weekWindow, type WeekSettings } from "@/lib/teacher/week";
import { getTrainingContent } from "./content";
import { getProfile, toCard } from "./store";

// A learner's own numbers (spec: Student experience): home, progress and My words. These
// read only the signed-in learner's data.

const DAY_MS = 86_400_000;

async function weekSettingsFor(userId: string) {
  const db = getDb();
  const profile = await getProfile(db, userId);
  // A class student follows their most recently joined class's goal and week.
  const [c] = await db
    .select({
      goal: classroom.weeklyGoalMinutes,
      resetDay: classroom.weekResetDay,
      resetTime: classroom.weekResetTime,
      timeZone: classroom.timeZone,
    })
    .from(seat)
    .innerJoin(classroom, eq(seat.classroomId, classroom.id))
    .where(eq(seat.studentId, userId))
    .orderBy(desc(seat.joinedAt))
    .limit(1);
  const week: WeekSettings = c
    ? { resetDay: c.resetDay, resetTime: c.resetTime, timeZone: c.timeZone }
    : { resetDay: 0, resetTime: "23:59", timeZone: profile.timeZone };
  return { profile, week, goal: c?.goal ?? profile.weeklyGoalMinutes, inClass: Boolean(c) };
}

async function countedMinutes(userId: string, w: { start: Date; end: Date }) {
  const db = getDb();
  const [[active], [flagged]] = await Promise.all([
    db
      .select({ ms: sql<number>`coalesce(sum(${activeTime.ms}), 0)::int` })
      .from(activeTime)
      .where(
        and(eq(activeTime.userId, userId), gte(activeTime.at, w.start), lt(activeTime.at, w.end)),
      ),
    db
      .select({ ms: sql<number>`coalesce(sum(${answerEvent.activeMs}), 0)::int` })
      .from(answerEvent)
      .innerJoin(answerFlag, eq(answerFlag.answerEventId, answerEvent.id))
      .where(
        and(
          eq(answerEvent.userId, userId),
          gte(answerEvent.serverReceivedAt, w.start),
          lt(answerEvent.serverReceivedAt, w.end),
        ),
      ),
  ]);
  return Math.max(0, (active!.ms - flagged!.ms) / 60_000);
}

async function studied(userId: string) {
  const db = getDb();
  const [progress, cards] = await Promise.all([
    db.select().from(senseProgress).where(eq(senseProgress.userId, userId)),
    db.select().from(card).where(eq(card.userId, userId)),
  ]);
  return progress.map((p) => {
    const mine = cards.filter((c) => c.senseId === p.senseId);
    const r = mine.find((c) => c.kind === "recognition");
    const prod = mine.find((c) => c.kind === "production");
    return {
      senseId: p.senseId,
      introducedAt: p.introducedAt,
      bestRecognitionPassDays: p.bestRecognitionPassDays,
      recognition: r ? toCard(r) : null,
      production: prod ? toCard(prod) : null,
    };
  });
}

export async function vocabularySize(userId: string, now = new Date()): Promise<number> {
  const profile = await getProfile(getDb(), userId);
  const content = await getTrainingContent();
  const rows = await studied(userId);
  return estimateVocabularySize({
    ability: profile.ability,
    studied: rows.flatMap((r) => {
      const s = content.byId.get(r.senseId);
      return s && r.recognition
        ? [{ rank: s.frequencyRank, recall: recall(r.recognition, now) }]
        : [];
    }),
  });
}

/** Saves today's estimate for the progress chart (called when a session ends). */
export async function snapshotVocabulary(userId: string, now = new Date()) {
  const { week } = await weekSettingsFor(userId);
  const size = await vocabularySize(userId, now);
  await getDb()
    .insert(vocabSnapshot)
    .values({ userId, day: localDay(now, week.timeZone), size })
    .onConflictDoUpdate({ target: [vocabSnapshot.userId, vocabSnapshot.day], set: { size } });
}

export async function learnerHome(userId: string, now = new Date()) {
  const { week, goal, inClass, profile } = await weekSettingsFor(userId);
  const w = weekWindow(now, week);
  const db = getDb();
  const slices = weekDays(w, week.timeZone);
  const [minutes, [acc], days, vocabulary, perDay, recentDays, trend, words] = await Promise.all([
    countedMinutes(userId, w),
    db
      .select({
        answered: sql<number>`count(*)::int`,
        correct: sql<number>`count(*) filter (where ${answerEvent.correct})::int`,
      })
      .from(answerEvent)
      .where(
        and(
          eq(answerEvent.userId, userId),
          eq(answerEvent.isPretest, false),
          gte(answerEvent.serverReceivedAt, w.start),
          lt(answerEvent.serverReceivedAt, w.end),
        ),
      ),
    db
      .select({ at: activeTime.at })
      .from(activeTime)
      .where(
        and(eq(activeTime.userId, userId), gte(activeTime.at, w.start), lt(activeTime.at, w.end)),
      ),
    vocabularySize(userId, now),
    countedMinutesByDay([userId], slices),
    db
      .selectDistinct({ at: activeTime.at })
      .from(activeTime)
      .where(
        and(
          eq(activeTime.userId, userId),
          gte(activeTime.at, new Date(now.getTime() - 120 * DAY_MS)),
        ),
      ),
    db
      .select({ size: vocabSnapshot.size })
      .from(vocabSnapshot)
      .where(eq(vocabSnapshot.userId, userId))
      .orderBy(desc(vocabSnapshot.day))
      .limit(14),
    myWords(userId, now),
  ]);
  const today = localDay(now, week.timeZone);
  return {
    goalMinutes: goal,
    goalEditable: !inClass,
    minutes: Math.round(minutes * 10) / 10,
    accuracy: acc!.answered ? Math.round((100 * acc!.correct) / acc!.answered) : null,
    daysTrained: new Set(days.map((d) => localDay(d.at, week.timeZone))).size,
    vocabulary,
    startLevel: profile.startLevel,
    week: slices.map((d, i) => ({ day: d.day, minutes: perDay[i]!, today: d.day === today })),
    streak: streakDays(
      new Set(recentDays.map((d) => localDay(d.at, week.timeZone))),
      now,
      week.timeZone,
    ),
    vocabularyTrend: trend.map((t) => t.size).reverse(),
    words: {
      new: words.filter((x) => x.stage === "new").length,
      learning: words.filter((x) => x.stage === "learning").length,
      learned: words.filter((x) => x.stage === "learned").length,
      due: words.filter((x) => x.state === "due").length,
    },
  };
}

export async function learnerProgress(userId: string, now = new Date()) {
  const { week, goal } = await weekSettingsFor(userId);
  const db = getDb();
  const content = await getTrainingContent();
  const [snapshots, rows] = await Promise.all([
    db
      .select()
      .from(vocabSnapshot)
      .where(eq(vocabSnapshot.userId, userId))
      .orderBy(vocabSnapshot.day),
    studied(userId),
  ]);
  const perLevel = new Map<number, number>();
  for (const r of rows) {
    const s = content.byId.get(r.senseId);
    if (!s || !r.recognition) continue;
    const learned = isLearned(
      {
        recognition: r.recognition,
        production: null,
        bestRecognitionPassDays: r.bestRecognitionPassDays,
      },
      now,
    );
    if (learned) perLevel.set(s.level, (perLevel.get(s.level) ?? 0) + 1);
  }
  const weeks = [];
  for (let o = -7; o <= 0; o++) {
    const w = weekWindow(now, week, o);
    const [[acc], minutes] = await Promise.all([
      db
        .select({
          answered: sql<number>`count(*)::int`,
          correct: sql<number>`count(*) filter (where ${answerEvent.correct})::int`,
        })
        .from(answerEvent)
        .where(
          and(
            eq(answerEvent.userId, userId),
            eq(answerEvent.isPretest, false),
            gte(answerEvent.serverReceivedAt, w.start),
            lt(answerEvent.serverReceivedAt, w.end),
          ),
        ),
      countedMinutes(userId, w),
    ]);
    weeks.push({
      start: w.start.toISOString(),
      minutes: Math.round(minutes * 10) / 10,
      accuracy: acc!.answered ? Math.round((100 * acc!.correct) / acc!.answered) : null,
    });
  }
  return {
    goalMinutes: goal,
    studied: rows.length,
    vocabulary: snapshots.map((s) => ({ day: s.day, size: s.size })),
    learnedByLevel: [...perLevel]
      .sort((a, b) => a[0] - b[0])
      .map(([level, words]) => ({ level, words })),
    minutesByWeek: weeks,
  };
}

export type WordState = "new" | "learning" | "learned" | "due";

export async function myWords(userId: string, now = new Date()) {
  const content = await getTrainingContent();
  const rows = await studied(userId);
  const out = rows.flatMap((r) => {
    const core = content.core.get(r.senseId);
    if (!core || !r.recognition) return [];
    const memory = {
      recognition: r.recognition,
      production: r.production,
      bestRecognitionPassDays: r.bestRecognitionPassDays,
    };
    const due = [r.recognition, r.production].some((c) => c && c.due.getTime() <= now.getTime());
    // Stage ignores whether a review is due: new, then learning, then learned.
    const stage: Exclude<WordState, "due"> = isLearned(memory, now)
      ? "learned"
      : now.getTime() - r.introducedAt.getTime() < DAY_MS
        ? "new"
        : "learning";
    const state: WordState = due ? "due" : stage;
    return [
      {
        senseId: r.senseId,
        display: core.display,
        gloss: core.gloss,
        state,
        stage,
        recognition: Math.round(100 * recall(r.recognition, now)),
        production: r.production ? Math.round(100 * recall(r.production, now)) : 0,
      },
    ];
  });
  return out.sort((a, b) => a.display.localeCompare(b.display, "es"));
}
