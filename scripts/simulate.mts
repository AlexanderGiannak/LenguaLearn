// Runs the engine simulator and writes docs/simulator-report.md.
//   npm run simulate
// Synthetic learners and words only; nothing here touches the database.
import { writeFileSync } from "node:fs";
import { ENGINE_CONFIG } from "../lib/engine/config.ts";
import {
  buildBank,
  simulate,
  type Cohort,
  type LearnerResult,
  type SimOptions,
} from "../lib/engine/simulator/simulate.ts";

const LEARNERS = 100;
const DAYS = 60;
const SEED = 20261021;
const bank = buildBank(8000, SEED);

const base = (cohort: Cohort): SimOptions => ({
  cohort,
  learners: LEARNERS,
  days: DAYS,
  seed: SEED,
  trainingDaysPerWeek: 5,
  sessionMinutes: ENGINE_CONFIG.session.defaultMinutes,
  productionUnlockStabilityDays: ENGINE_CONFIG.productionUnlockStabilityDays,
});

// --- statistics ---------------------------------------------------------------------

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo]! + (s[Math.ceil(i)]! - s[lo]!) * (i - lo);
}
const fmt = (x: number, digits = 1) =>
  Number.isFinite(x)
    ? x.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "–";
const spread = (xs: number[], digits = 1) =>
  `${fmt(quantile(xs, 0.5), digits)} (${fmt(quantile(xs, 0.1), digits)}–${fmt(quantile(xs, 0.9), digits)})`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function perLearner(r: LearnerResult) {
  const trained = r.days.filter((d) => d.trained);
  const lastTwoWeeks = trained.filter((d) => d.day >= DAYS - 14);
  const answers = trained.reduce((s, d) => s + d.answers, 0);
  return {
    newPerDay: mean(trained.map((d) => d.newWords)),
    backlog: mean(trained.map((d) => d.backlogAtStart)),
    backlogLate: mean(lastTwoWeeks.map((d) => d.backlogAtStart)),
    answersPerSession: mean(trained.map((d) => d.answers)),
    accuracy: (100 * trained.reduce((s, d) => s + d.correct, 0)) / answers,
    capHit: (100 * trained.filter((d) => d.hitNewWordCap).length) / trained.length,
    learned: r.learnedAtEnd,
    minutesPerLearned: r.learnedAtEnd ? r.totalMinutes / r.learnedAtEnd : NaN,
    totalMinutes: r.totalMinutes,
    vocabTrue: r.trueVocabulary,
    vocabSpec: r.vocabularyEstimate,
    vocabFirst: r.vocabularyEstimateFirstExposure,
  };
}
type Row = ReturnType<typeof perLearner>;
const col = (rows: Row[], k: keyof Row) => rows.map((r) => r[k]);

function summaryTable(runs: { label: string; rows: Row[] }[]): string {
  const metrics: [string, keyof Row, number][] = [
    ["New words per training day", "newPerDay", 1],
    ["Sessions that hit the 8-new-word cap (%)", "capHit", 0],
    ["Review backlog at session start", "backlog", 1],
    ["Review backlog at session start, last 2 weeks", "backlogLate", 1],
    ["Answers per 15-minute session", "answersPerSession", 0],
    ["Accuracy (%)", "accuracy", 0],
    ["Words learned by day 60", "learned", 0],
    ["Active minutes over 60 days", "totalMinutes", 0],
    ["Minutes per learned word", "minutesPerLearned", 1],
  ];
  const head = `| Metric | ${runs.map((r) => r.label).join(" | ")} |\n|---|${runs.map(() => "---|").join("")}`;
  const body = metrics
    .map(
      ([name, k, d]) => `| ${name} | ${runs.map((r) => spread(col(r.rows, k), d)).join(" | ")} |`,
    )
    .join("\n");
  return `${head}\n${body}`;
}

function weeklyTable(results: LearnerResult[]): string {
  const lines = [
    "| Week | New words per training day | Backlog at session start | Learned at end of week |",
    "|---|---|---|---|",
  ];
  for (let w = 0; w * 7 < DAYS; w++) {
    const days = results.flatMap((r) => r.days.filter((d) => d.day >= w * 7 && d.day < w * 7 + 7));
    const trained = days.filter((d) => d.trained);
    const lastDay = Math.min(DAYS - 1, w * 7 + 6);
    const learned = results.map((r) => r.days[lastDay]!.learned);
    lines.push(
      `| ${w + 1} | ${fmt(mean(trained.map((d) => d.newWords)))} | ${fmt(mean(trained.map((d) => d.backlogAtStart)))} | ${fmt(quantile(learned, 0.5), 0)} |`,
    );
  }
  return lines.join("\n");
}

function vocabTable(runs: { label: string; rows: Row[] }[]): string {
  const lines = [
    "| Cohort | True vocabulary | Spec rule: every answer updates ability | Alternative: first exposures only |",
    "|---|---|---|---|",
  ];
  for (const { label, rows } of runs) {
    lines.push(
      `| ${label} | ${spread(col(rows, "vocabTrue"), 0)} | ${spread(col(rows, "vocabSpec"), 0)} | ${spread(col(rows, "vocabFirst"), 0)} |`,
    );
  }
  return lines.join("\n");
}

// --- runs ---------------------------------------------------------------------------

const t0 = Date.now();
const results = {
  beginner: simulate(base("beginner"), bank),
  intermediate: simulate(base("intermediate"), bank),
  beginnerOneCard: simulate({ ...base("beginner"), productionUnlockStabilityDays: Infinity }, bank),
  intermediateOneCard: simulate(
    { ...base("intermediate"), productionUnlockStabilityDays: Infinity },
    bank,
  ),
};
const rows = Object.fromEntries(
  Object.entries(results).map(([k, v]) => [k, v.map(perLearner)]),
) as Record<keyof typeof results, Row[]>;

// Gate sweep. The config object is mutated here, in this script only, to try other values.
const gate = ENGINE_CONFIG.newWordGate as { maxNewPerSession: number };
const sweep: { label: string; rows: Row[] }[] = [];
for (const cap of [6, 8, 10, 12]) {
  gate.maxNewPerSession = cap;
  for (const cohort of ["beginner", "intermediate"] as const) {
    sweep.push({
      label: `${cohort}, cap ${cap}`,
      rows: simulate(base(cohort), bank).map(perLearner),
    });
  }
}
gate.maxNewPerSession = 8;
const seconds = ((Date.now() - t0) / 1000).toFixed(0);

const sweepTable = [
  "| Cap on new words per session | Cohort | New per day | Backlog, last 2 weeks | Learned by day 60 | Minutes per learned word | Accuracy (%) |",
  "|---|---|---|---|---|---|---|",
  ...sweep.map(({ label, rows: r }) => {
    const [cohort, cap] = label.split(", cap ");
    return `| ${cap} | ${cohort} | ${spread(col(r, "newPerDay"))} | ${spread(col(r, "backlogLate"))} | ${spread(col(r, "learned"), 0)} | ${spread(col(r, "minutesPerLearned"))} | ${spread(col(r, "accuracy"), 0)} |`;
  }),
].join("\n");

const report = `# Engine simulator report

Generated by \`npm run simulate\` (${LEARNERS} learners per cohort, ${DAYS} days, seed ${SEED}, ${seconds} s). Do not edit by hand; rerun the script.

Values are the median across learners, with the 10th–90th percentile range in parentheses.

## Setup

- **Schedule:** a ${ENGINE_CONFIG.session.defaultMinutes}-minute session on 5 days a week (a school week), 60 days in all.
- **Engine:** the real \`lib/engine\` code with the current config: next-item order, new-word gate (last 10 answers ≥ 75% correct, fewer than 20 overdue, at most 8 new per session), question bands, ratings and ts-fsrs scheduling. The production card unlocks at ${ENGINE_CONFIG.productionUnlockStabilityDays} days of recognition stability.
- **Words:** 8,000 synthetic words in frequency order. No content is used.
- **Beginners:** know about the first 30 words. They start at level 1.
- **Intermediate learners:** know words up to around rank 2,000 (it varies by learner). Placement isn't built yet (Phase 7), so they start at the level where they know about 80% of words, and lower words are not reviewed.
- **Memory:** a learner's true recall follows the FSRS forgetting curve, with stability scaled by a personal memory factor (median 1, typical range 0.6–1.6). So this measures **workload and pacing, not FSRS accuracy**.
- **Answers:**
  - A student who doesn't know a multiple-choice answer guesses half the time and picks "I don't know" otherwise.
  - Typed answers have a 5% spelling failure, and 12% of right typed answers have a slip (accent, article or typo) that rates Hard.
- **Timing:**
  - Multiple choice takes about 4.5 s and typing about 8 s.
  - A word page takes about 15 s.
  - Feedback takes 2 s after a right answer and 6 s after a wrong one.

## Spec defaults: two cards per sense vs one

${summaryTable([
  { label: "Beginner, two cards", rows: rows.beginner },
  { label: "Beginner, one card", rows: rows.beginnerOneCard },
  { label: "Intermediate, two cards", rows: rows.intermediate },
  { label: "Intermediate, one card", rows: rows.intermediateOneCard },
])}

"Learned" uses the spec's definition: a passed recognition review after a gap of at least 7 days, with current predicted recall of at least 85%. With one card per sense there are no production questions at all, so its words are "learned" with no evidence that the student can produce them.

## Week by week (two cards)

### Beginners

${weeklyTable(results.beginner)}

### Intermediate learners

${weeklyTable(results.intermediate)}

## New-word cap per session

${sweepTable}

## Vocabulary-size estimate

${vocabTable([
  { label: "Beginner", rows: rows.beginner },
  { label: "Intermediate", rows: rows.intermediate },
])}

"True vocabulary" is what the simulated learner actually knows, counted over the first ${ENGINE_CONFIG.ability.vocabularyMaxRank.toLocaleString("en-US")} ranks. The spec's rule updates ability after every graded answer, including reviews of words the app just taught. Those are mostly right, so ability climbs as if the learner knew many untaught words. The alternative updates ability only on first exposures: whether "I already know this" was right, or the student chose "Got it".
`;

writeFileSync(new URL("../docs/simulator-report.md", import.meta.url), report);
console.log(`Wrote docs/simulator-report.md in ${seconds} s.`);
