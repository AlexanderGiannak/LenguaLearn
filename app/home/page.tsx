import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChartCard, ColumnChart, StackedBar, StatTile } from "@/app/_components/charts";
import { focusRing, muted } from "@/app/_components/styles";
import { learnerHome } from "@/lib/train/learner";
import { learnerPage } from "@/lib/train/page-gate";
import { GoalEditor } from "./goal-editor";

export const metadata: Metadata = { title: "Home · LenguaLearn" };

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Ring({ value, goal }: { value: number; goal: number }) {
  const share = Math.min(1, goal > 0 ? value / goal : 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-32 w-32 shrink-0"
      role="img"
      aria-label={`${value} of ${goal} minutes this week`}
    >
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="12"
        style={{ stroke: "var(--chart-grid)" }}
      />
      {/* At zero the round line cap would still draw a dot, so the arc starts once there is time. */}
      {share > 0 && (
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          transform="rotate(-90 60 60)"
          style={{ stroke: "var(--chart-1)" }}
        />
      )}
      <text x="60" y="60" textAnchor="middle" className="fill-current text-[28px] font-extrabold">
        {Math.round(value)}
      </text>
      <text x="60" y="80" textAnchor="middle" className="fill-ink-500 text-xs dark:fill-ink-400">
        of {goal} min
      </text>
    </svg>
  );
}

function Flame() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.3-5 .2 1.6 1 2.7 2.2 3.2C11 8.6 11 5.4 12 2z"
        className="fill-amber-500"
      />
    </svg>
  );
}

const weekday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const fullDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const NAV: [string, string, string][] = [
  ["/words", "My words", "Every word you've met and how well you know it"],
  ["/progress", "Progress", "Your vocabulary, minutes and accuracy over time"],
  ["/settings", "Settings", "Sound, theme, and your account"],
];

async function Home() {
  const u = await learnerPage("/home");
  const h = await learnerHome(u.id);
  const today = h.week.find((d) => d.today);
  const studied = h.words.new + h.words.learning + h.words.learned;
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={muted}>Welcome back</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{u.username ?? u.name}</h1>
        </div>
        <p className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-amber-200 bg-amber-50 px-4 font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <Flame />
          {h.streak === 0 ? "Start a streak today" : `${h.streak}-day streak`}
        </p>
      </div>

      <Link
        href="/train"
        className={`btn btn-primary min-h-20 flex-col gap-0 rounded-2xl text-2xl ${focusRing}`}
      >
        Start training
        {h.words.due > 0 && (
          <span className="text-base font-semibold opacity-90">
            {h.words.due} {h.words.due === 1 ? "word is" : "words are"} ready for review
          </span>
        )}
      </Link>

      <div className="grid gap-4 md:grid-cols-5">
        <ChartCard
          className="md:col-span-3"
          title="This week"
          subtitle={`${h.daysTrained} ${h.daysTrained === 1 ? "day" : "days"} trained · goal ${h.goalMinutes} minutes`}
        >
          <div className="flex flex-1 flex-col items-center justify-center gap-6 sm:flex-row">
            <Ring value={h.minutes} goal={h.goalMinutes} />
            <div className="w-full min-w-0 flex-1">
              <ColumnChart
                axis={false}
                height={130}
                label="Minutes per day this week"
                unit=" min"
                emphasis={today?.day}
                data={h.week.map((d) => ({
                  key: d.day,
                  label: weekday(d.day),
                  value: d.minutes,
                  detail: fullDay(d.day),
                }))}
              />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          className="md:col-span-2"
          title="Your words"
          subtitle={
            studied === 0
              ? "Words appear here as you meet them."
              : `${studied} words studied so far`
          }
        >
          <StackedBar
            label="Your words by stage"
            segments={[
              { key: "new", label: "New", value: h.words.new, color: "var(--stage-new)" },
              {
                key: "learning",
                label: "Learning",
                value: h.words.learning,
                color: "var(--stage-learning)",
              },
              {
                key: "learned",
                label: "Learned",
                value: h.words.learned,
                color: "var(--stage-learned)",
              },
            ]}
          />
          <p className={`text-sm ${muted}`}>
            A word is learned once you get it right after a gap of at least a week.
          </p>
        </ChartCard>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Vocabulary"
          value={`~${h.vocabulary.toLocaleString("en-US")}`}
          note="Spanish words you know"
          trend={h.vocabularyTrend}
        />
        <StatTile
          label="Accuracy this week"
          value={h.accuracy === null ? "–" : `${h.accuracy}%`}
          note="Answers right on the first try"
        />
        <StatTile
          label="Words learned"
          value={h.words.learned}
          note={`${h.words.learning} more on the way`}
        />
      </dl>

      {h.goalEditable && (
        <details className="card px-5 py-2">
          <summary
            className={`flex min-h-11 cursor-pointer items-center font-semibold ${focusRing}`}
          >
            Change your weekly goal
          </summary>
          <div className="pt-2 pb-4">
            <GoalEditor initial={h.goalMinutes} />
          </div>
        </details>
      )}

      <nav aria-label="More" className="grid gap-4 sm:grid-cols-3">
        {NAV.map(([href, title, text]) => (
          <Link
            key={href}
            href={href}
            className={`card flex flex-col gap-1 p-5 transition-colors hover:border-brand-300 dark:hover:border-brand-700 ${focusRing}`}
          >
            <span className="font-bold">{title} →</span>
            <span className={`text-sm ${muted}`}>{text}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
