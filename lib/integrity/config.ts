// Integrity thresholds (spec: Integrity). All are starting guesses; check them against real
// answer-time distributions once data exists. Phase 6 adds the flagged-time rules.

export const INTEGRITY_CONFIG = {
  /** A screen counts for at most this long toward active time (ms). */
  maxScreenMs: { choice: 60_000, typed: 90_000 },
} as const;
