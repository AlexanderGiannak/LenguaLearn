// Grade export and dashboard status (spec: Grade export, Dashboard).

export type GradeFormula = { goalWeight: number; accuracyWeight: number; flaggedDeduction: number };

/** Owner's default (DECISIONS.md): 100% weight on percent of goal. */
export const DEFAULT_FORMULA: GradeFormula = {
  goalWeight: 1,
  accuracyWeight: 0,
  flaggedDeduction: 0,
};

export function percentOfGoal(minutes: number, goalMinutes: number): number {
  return goalMinutes > 0 ? Math.round((100 * minutes) / goalMinutes) : 0;
}

/**
 * Suggested grade out of 100: a weighted mix of percent of goal (capped at 100%) and
 * accuracy, minus a deduction per flagged minute. Weights are relative to each other.
 */
export function suggestedGrade(
  r: { minutes: number; goalMinutes: number; accuracy: number | null; flaggedMinutes: number },
  f: GradeFormula,
): number {
  const goal = r.goalMinutes > 0 ? Math.min(100, (100 * r.minutes) / r.goalMinutes) : 0;
  const total = f.goalWeight + f.accuracyWeight;
  const base = total > 0 ? (f.goalWeight * goal + f.accuracyWeight * (r.accuracy ?? 0)) / total : 0;
  const grade = base - f.flaggedDeduction * r.flaggedMinutes;
  return Math.round(Math.max(0, Math.min(100, grade)));
}

export const STATUS_CONFIG = {
  /** Flagged when flagged minutes are at least this many... */
  flaggedMinMinutes: 5,
  /** ...and at least this share of all minutes this week. */
  flaggedMinShare: 0.2,
} as const;

export type SeatStatus = "on_track" | "behind" | "not_started" | "flagged";

/**
 * On track means keeping pace with the goal: by halfway through the week, half the goal.
 * Flagged takes priority, so the teacher looks at the integrity detail first.
 */
export function seatStatus(s: {
  minutes: number;
  flaggedMinutes: number;
  goalMinutes: number;
  /** Fraction of the week that has passed, 0–1 (1 for past weeks). */
  weekElapsed: number;
  activeThisWeek: boolean;
}): SeatStatus {
  if (!s.activeThisWeek) return "not_started";
  const total = s.minutes + s.flaggedMinutes;
  if (
    s.flaggedMinutes >= STATUS_CONFIG.flaggedMinMinutes &&
    s.flaggedMinutes >= STATUS_CONFIG.flaggedMinShare * total
  ) {
    return "flagged";
  }
  const pace = s.goalMinutes * Math.min(1, Math.max(0, s.weekElapsed));
  return s.minutes >= Math.min(pace, s.goalMinutes) ? "on_track" : "behind";
}
