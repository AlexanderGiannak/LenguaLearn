// Every engine threshold in one place (spec: "Keep the thresholds in the engine config").
// Most are the spec's starting values; the simulator (npm run simulate) is how to tune them.

export const ENGINE_CONFIG = {
  fsrs: {
    requestRetention: 0.9,
    // Short-term mode: same-day repeats use FSRS-6's short-term stability formula, so three
    // reviews in one session do not count as three days of evidence (see DECISIONS.md).
    enableShortTerm: true,
    // Off so scheduling is reproducible in tests and the simulator.
    enableFuzz: false,
    maximumIntervalDays: 36500,
  },

  /** The production card is created once recognition stability reaches this (days). */
  productionUnlockStabilityDays: 3,

  /** Question bands by the tested card's stability (days): under low, low..high, over high. */
  bands: { lowDays: 2, highDays: 10 },

  /** Learned: passed a recognition review after a gap of at least this many days... */
  learnedMinIntervalDays: 7,
  /** ...and current predicted recall is at least this. */
  learnedMinRecall: 0.85,

  session: {
    defaultMinutes: 15,
    /** A missed item comes back this many items later (inclusive range). */
    missReturnAfterItems: [3, 5] as const,
    /** A new word's second check comes this many items after its intro. */
    secondCheckAfterItems: [4, 6] as const,
  },

  newWordGate: {
    recentAnswers: 10,
    minRecentAccuracy: 0.75,
    /** Gate closes at this many overdue reviews. */
    maxOverdue: 20,
    /** Gate closes after this many new words in one session. */
    maxNewPerSession: 8,
  },

  rating: {
    /** Slower than this percentile of the student's own times for the question type: Hard. */
    slowPercentile: 0.8,
    /** Faster than this percentile on a typed question: Easy. */
    fastPercentile: 0.5,
    /** Below this many past answers of a type, use the default times below. */
    minSamplesForPercentile: 10,
    /** Fallback slow / fast thresholds in milliseconds, by answer mode. */
    defaultSlowMs: { choice: 8000, typed: 15000 },
    defaultFastMs: { choice: 3000, typed: 6000 },
  },

  answerCheck: {
    /** Production stability (days) from which a missing or wrong accent is rated Hard. */
    accentHardFromDays: 21,
    /** Words at least this long (letters) allow one typo, rated Hard ("Almost"). */
    typoMinLength: 6,
  },

  ability: {
    /** Logistic slope of P(correct) against (ability - difficulty), in log-rank units. */
    slope: 1.2,
    /** Chance of guessing a 4-option question right. */
    choiceGuessRate: 0.25,
    /** Elo step size: starts large and shrinks with the number of answers. */
    kStart: 0.4,
    kMin: 0.05,
    kHalfLifeAnswers: 50,
    /** Ability of a total beginner: knows roughly the first few dozen words. */
    beginnerAbility: Math.log(30),
    /** Ranks counted when estimating unstudied words ("about 10,000" bank). */
    vocabularyMaxRank: 10_000,
  },

  /** Words per level band, mirrored from the content model (lib/content/constants.ts). */
  levelBandSize: 500,
} as const;

export type EngineConfig = typeof ENGINE_CONFIG;
