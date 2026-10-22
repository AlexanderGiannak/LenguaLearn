// The demo site (DEMO_SITE=1): sample fixture words, a banner, and one-click accounts.
// Production runs as the demo until real users arrive; demo mode is then switched off and
// the database wiped (docs/DECISIONS.md).

export function isDemoSite(env: Record<string, string | undefined>): boolean {
  return env.DEMO_SITE === "1";
}

export const DEMO_CONFIG = {
  /** Teacher demos kept ready, so a visitor rarely waits for one to be built. */
  teacherPoolSize: 3,
  /**
   * The class each teacher demo gets: students trained through the real service. Full
   * sessions of 10 minutes put the keen students on track; others train less, two rush
   * one session (flagged by the integrity rules), and a few never start.
   */
  demoClass: { students: 25, days: 7, minutesPerSession: 10 },
  /** Claimed demo accounts are deleted this long after the visitor took them. */
  claimedTtlMs: 24 * 3_600_000,
  /** An unclaimed pool class goes stale (its "this week" drifts), so it is rebuilt. */
  unclaimedTtlMs: 12 * 3_600_000,
  /** Per browser (device cookie) and site-wide caps, per hour. */
  limits: {
    perDevice: 6,
    learnersSiteWide: 300,
    teachersSiteWide: 40,
  },
} as const;
