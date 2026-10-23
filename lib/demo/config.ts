// The demo site (DEMO_SITE=1): sample fixture words, a banner, and one-click accounts.
// Production runs as the demo until real users arrive; demo mode is then switched off and
// the database wiped (docs/DECISIONS.md).

export function isDemoSite(env: Record<string, string | undefined>): boolean {
  return env.DEMO_SITE === "1";
}

/** Whether ready-made demo accounts are built ahead of time (off with DEMO_PREBUILD=0). */
export function demoPrebuild(env: Record<string, string | undefined>): boolean {
  return isDemoSite(env) && env.DEMO_PREBUILD !== "0";
}

export const DEMO_CONFIG = {
  /** Teacher and learner demos kept ready, so a visitor rarely waits for one to be built. */
  teacherPoolSize: 3,
  learnerPoolSize: 3,
  /**
   * The class each teacher demo gets: four weeks of students trained through the real
   * service. Full sessions of 10 minutes put the keen students on track; others train less,
   * two rush one session this week (flagged by the integrity rules), and a few haven't
   * started this week. About a minute or two to build, so it comes from the pool.
   */
  demoClass: { students: 25, days: 28, minutesPerSession: 10 },
  /** Built on the spot only when the pool is empty: one week, ready in seconds. */
  quickClass: { students: 25, days: 7, minutesPerSession: 10 },
  /** A demo learner's practice history, in days; the short one is the on-the-spot build. */
  learnerDays: 21,
  quickLearnerDays: 7,
  /** On the deployed demo, the pools are topped up on this timer as well as after a visit. */
  refillEveryMs: 3_600_000,
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
