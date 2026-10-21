import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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

const muted = "text-zinc-600 dark:text-zinc-400";
const link =
  "inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-600";

function Ring({ value, goal }: { value: number; goal: number }) {
  const share = Math.min(1, goal > 0 ? value / goal : 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-36 w-36"
      role="img"
      aria-label={`${value} of ${goal} minutes this week`}
    >
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        strokeWidth="12"
        className="stroke-zinc-200 dark:stroke-zinc-800"
      />
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
        className="stroke-zinc-900 dark:stroke-zinc-100"
      />
      <text x="60" y="58" textAnchor="middle" className="fill-current text-2xl font-semibold">
        {Math.round(value)}
      </text>
      <text x="60" y="78" textAnchor="middle" className="fill-current text-xs">
        of {goal} min
      </text>
    </svg>
  );
}

async function Home() {
  const u = await learnerPage("/home");
  const h = await learnerHome(u.id);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <Link
        href="/train"
        className="flex min-h-20 items-center justify-center rounded-2xl bg-zinc-900 text-2xl font-semibold text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Start training
      </Link>
      <div className="flex flex-wrap items-center gap-8">
        <Ring value={h.minutes} goal={h.goalMinutes} />
        <dl className="flex flex-col gap-3">
          <div>
            <dt className={`text-sm ${muted}`}>Vocabulary</dt>
            <dd className="text-xl font-semibold">
              You know about {h.vocabulary.toLocaleString("en-US")} Spanish words
            </dd>
          </div>
          <div>
            <dt className={`text-sm ${muted}`}>Accuracy this week</dt>
            <dd className="text-xl font-semibold">
              {h.accuracy === null ? "–" : `${h.accuracy}%`}
            </dd>
          </div>
          <div>
            <dt className={`text-sm ${muted}`}>Days trained this week</dt>
            <dd className="text-xl font-semibold">{h.daysTrained}</dd>
          </div>
        </dl>
      </div>
      {h.goalEditable && <GoalEditor initial={h.goalMinutes} />}
      <nav aria-label="More" className="flex flex-wrap gap-x-6">
        <Link className={link} href="/words">
          My words
        </Link>
        <Link className={link} href="/progress">
          Progress
        </Link>
        <Link className={link} href="/settings">
          Settings
        </Link>
      </nav>
    </main>
  );
}
