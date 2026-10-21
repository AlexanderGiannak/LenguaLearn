// Integrity thresholds (spec: Integrity). All are starting guesses, kept in this one file.
// Once real data exists, check them against answer-time distributions and adjust.

export const INTEGRITY_CONFIG = {
  /** A screen counts for at most this long toward active time (ms). */
  maxScreenMs: { choice: 60_000, typed: 90_000, feedback: 60_000 },
  /** No input for this long pauses the session ("Still there?"). Paused time never counts. */
  idlePauseMs: 120_000,

  /** Minimum reading time for a 4-option meaning question... */
  minReadingBaseMs: 1_000,
  /** ...which has about this much text on screen... */
  minReadingBaseChars: 40,
  /** ...plus this much per extra character. */
  minReadingMsPerChar: 15,

  /** Fast answers in a row that start a flag... */
  fastStreak: 3,
  /** ...when accuracy across them is below this. */
  fastMaxAccuracy: 0.5,
  /** Same option position chosen this many times in a row while wrong. */
  samePositionStreak: 6,
  /** Answering within this long of returning to a hidden tab. */
  hiddenReturnMs: 2_000,

  /** Server checks: an answer this soon after its question was issued is impossible. */
  impossibleMs: 300,
  /** Client and server times may disagree by this much before the server's is used. */
  clockToleranceMs: 2_000,

  /** Shown to the student, once per flagged stretch. */
  studentNote: "You're answering very quickly. Slow down so this time counts.",
} as const;
