import type { Metadata } from "next";
import { Suspense } from "react";
import { learnerProgress } from "@/lib/train/learner";
import { learnerPage } from "@/lib/train/page-gate";

export const metadata: Metadata = { title: "Progress · LenguaLearn" };

export default function ProgressPage() {
  return (
    <Suspense>
      <Progress />
    </Suspense>
  );
}

const muted = "text-ink-600 dark:text-ink-400";

function LineChart({ points }: { points: { day: string; size: number }[] }) {
  if (points.length < 2) return <p className={muted}>The chart appears after a few sessions.</p>;
  const w = 600;
  const h = 200;
  const max = Math.max(...points.map((p) => p.size), 10);
  const x = (i: number) => (i / (points.length - 1)) * (w - 20) + 10;
  const y = (v: number) => h - 10 - (v / max) * (h - 30);
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.size).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label={`Estimated vocabulary from ${points[0]!.size} to ${points.at(-1)!.size} words`}
    >
      <path d={d} fill="none" strokeWidth="3" className="stroke-ink-900 dark:stroke-ink-100" />
      {points.map((p, i) => (
        <circle
          key={p.day}
          cx={x(i)}
          cy={y(p.size)}
          r="3"
          className="fill-ink-900 dark:fill-ink-100"
        >
          <title>{`${p.day}: ${p.size} words`}</title>
        </circle>
      ))}
    </svg>
  );
}

async function Progress() {
  const u = await learnerPage("/progress");
  const p = await learnerProgress(u.id);
  const maxMinutes = Math.max(1, ...p.minutesByWeek.map((m) => m.minutes));
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
      <section aria-labelledby="vocab-h">
        <h2 id="vocab-h" className="text-xl font-semibold">
          Estimated vocabulary
        </h2>
        <LineChart points={p.vocabulary} />
      </section>
      <section aria-labelledby="levels-h">
        <h2 id="levels-h" className="text-xl font-semibold">
          Words learned by level
        </h2>
        {p.learnedByLevel.length === 0 ? (
          <p className={muted}>
            None yet. A word counts as learned after a successful review at least 7 days later.
          </p>
        ) : (
          <ul className="mt-2">
            {p.learnedByLevel.map((l) => (
              <li key={l.level}>
                Level {l.level}: {l.words}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="minutes-h">
        <h2 id="minutes-h" className="text-xl font-semibold">
          Minutes per week
        </h2>
        <div
          className="mt-3 flex h-40 items-end gap-2"
          role="img"
          aria-label={p.minutesByWeek.map((m) => `${m.minutes} minutes`).join(", ")}
        >
          {p.minutesByWeek.map((m) => (
            <div key={m.start} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-ink-800 dark:bg-ink-200"
                style={{
                  height: `${(100 * m.minutes) / maxMinutes}%`,
                  minHeight: m.minutes ? 2 : 0,
                }}
              />
              <span className={`text-xs ${muted}`}>
                {new Date(m.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
