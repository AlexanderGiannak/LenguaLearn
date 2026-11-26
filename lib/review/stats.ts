// The nightly stats flags (spec: Content pipeline, step 5): items whose answers look
// unusual go to the review queue. Pure rules here; the database side is stats-job.ts.
//
// Accuracy and response time depend on the question type (typing is harder and slower than
// picking), so each sense is compared with what its own mix of question types would predict
// at its level, not with a single average.

export const STATS_CONFIG = {
  /** Answers looked at: the last 60 days. */
  windowDays: 60,
  /** A sense needs this many answers before its accuracy or speed is judged. */
  minAnswers: 30,
  /** Flag when accuracy is this far below what the question types predict (0.25 = 25 points). */
  accuracyGap: 0.25,
  /** A baseline for one level and question type needs this many answers; else all levels. */
  minBaselineAnswers: 100,
  /** Flag when one wrong option takes more than this share of wrong picks... */
  distractorShare: 0.5,
  /** ...out of at least this many wrong picks... */
  minWrongPicks: 10,
  /** ...on questions with at least this many options. With two (el/la), the one wrong option
   * always takes every wrong pick. */
  distractorMinOptions: 4,
  /** Flag when the typical answer takes this many times as long as usual for its type. */
  slowFactor: 2,
  /** A flag a reviewer closed is not raised again for this long. */
  quietDaysAfterReview: 30,
} as const;

export const FLAG_KINDS = ["low_accuracy", "distractor_magnet", "slow"] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

/** Answers to one sense with one question type. */
export type SenseTypeStats = {
  senseId: number;
  level: number;
  questionType: string;
  answers: number;
  correct: number;
  /** Median of each answer's time divided by the median time for its question type. */
  medianTimeRatio: number | null;
};

/** Wrong picks of one option for one sense, in one question type (each type has its own options). */
export type WrongPick = { senseId: number; questionType: string; option: string; picks: number };

export type Flag = { senseId: number; kind: FlagKind; detail: Record<string, number | string> };

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

/** Which senses look unusual. */
export function findFlags(
  stats: SenseTypeStats[],
  wrongPicks: WrongPick[],
  config: typeof STATS_CONFIG = STATS_CONFIG,
): Flag[] {
  // Baselines: accuracy per question type at each level, and over all levels.
  const byLevelType = new Map<string, { answers: number; correct: number }>();
  const byType = new Map<string, { answers: number; correct: number }>();
  for (const s of stats) {
    for (const [map, key] of [
      [byLevelType, `${s.level}|${s.questionType}`],
      [byType, s.questionType],
    ] as const) {
      const b = map.get(key) ?? { answers: 0, correct: 0 };
      b.answers += s.answers;
      b.correct += s.correct;
      map.set(key, b);
    }
  }
  const expected = (s: SenseTypeStats) => {
    const level = byLevelType.get(`${s.level}|${s.questionType}`)!;
    // Leave the sense's own answers out of its baseline, so one bad item can't hide itself.
    const own = (b: { answers: number; correct: number }) => ({
      answers: b.answers - s.answers,
      correct: b.correct - s.correct,
    });
    const atLevel = own(level);
    if (atLevel.answers >= config.minBaselineAnswers) return atLevel.correct / atLevel.answers;
    const all = own(byType.get(s.questionType)!);
    return all.answers > 0 ? all.correct / all.answers : null;
  };

  const bySense = new Map<number, SenseTypeStats[]>();
  for (const s of stats) bySense.set(s.senseId, [...(bySense.get(s.senseId) ?? []), s]);

  const flags: Flag[] = [];
  for (const [senseId, rows] of bySense) {
    const answers = rows.reduce((n, r) => n + r.answers, 0);
    if (answers < config.minAnswers) continue;
    const correct = rows.reduce((n, r) => n + r.correct, 0);
    const predicted = rows.map((r) => ({ r, e: expected(r) })).filter((x) => x.e !== null);
    const predictedAnswers = predicted.reduce((n, x) => n + x.r.answers, 0);
    if (predictedAnswers > 0) {
      const want = predicted.reduce((n, x) => n + x.e! * x.r.answers, 0) / predictedAnswers;
      const got = correct / answers;
      if (got < want - config.accuracyGap) {
        flags.push({
          senseId,
          kind: "low_accuracy",
          detail: { accuracy: round(got), expected: round(want), answers },
        });
      }
    }
    const timed = rows.filter((r) => r.medianTimeRatio !== null);
    const timedAnswers = timed.reduce((n, r) => n + r.answers, 0);
    if (timedAnswers >= config.minAnswers) {
      const ratio = timed.reduce((n, r) => n + r.medianTimeRatio! * r.answers, 0) / timedAnswers;
      if (ratio > config.slowFactor) {
        flags.push({ senseId, kind: "slow", detail: { timesUsual: round(ratio, 1), answers } });
      }
    }
  }

  const wrongByGroup = new Map<string, WrongPick[]>();
  for (const w of wrongPicks) {
    const key = `${w.senseId}|${w.questionType}`;
    wrongByGroup.set(key, [...(wrongByGroup.get(key) ?? []), w]);
  }
  // One flag per sense: the question type where one option draws the most.
  const magnets = new Map<number, Flag>();
  for (const picks of wrongByGroup.values()) {
    const total = picks.reduce((n, p) => n + p.picks, 0);
    if (total < config.minWrongPicks) continue;
    const top = picks.reduce((a, b) => (b.picks > a.picks ? b : a));
    const share = top.picks / total;
    const seen = magnets.get(top.senseId);
    if (share > config.distractorShare && (!seen || share > Number(seen.detail.share))) {
      magnets.set(top.senseId, {
        senseId: top.senseId,
        kind: "distractor_magnet",
        detail: {
          option: top.option,
          questionType: top.questionType,
          share: round(share),
          wrongPicks: total,
        },
      });
    }
  }
  return [...flags, ...magnets.values()];
}
