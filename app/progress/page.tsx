import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BarList, ChartCard, ColumnChart, LineChart, StatTile } from "@/app/_components/charts";
import { link, muted } from "@/app/_components/styles";
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

const short = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: iso.length === 10 ? "UTC" : undefined,
  });

async function Progress() {
  const u = await learnerPage("/progress");
  const p = await learnerProgress(u.id);
  const learned = p.learnedByLevel.reduce((n, l) => n + l.words, 0);
  const vocabulary = p.vocabulary.at(-1)?.size;
  const first = p.vocabulary[0]?.size;
  const thisWeek = p.minutesByWeek.at(-1)!;
  const maxLevel = Math.max(1, ...p.learnedByLevel.map((l) => l.words));
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-3">
        <Link href="/home" className={`${link} self-start text-sm`}>
          ← Home
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Progress</h1>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Vocabulary"
          value={vocabulary === undefined ? "–" : `~${vocabulary.toLocaleString("en-US")}`}
          note={
            vocabulary !== undefined && first !== undefined && vocabulary > first
              ? `+${vocabulary - first} since you started`
              : "Spanish words you know"
          }
        />
        <StatTile label="Words learned" value={learned} note="Right after a week or more" />
        <StatTile label="Words studied" value={p.studied} note="Met in training so far" />
        <StatTile
          label="This week"
          value={`${Math.round(thisWeek.minutes)} min`}
          note={`Goal ${p.goalMinutes} min`}
        />
      </dl>

      <ChartCard
        title="Estimated vocabulary"
        subtitle="How many Spanish words you know, updated after each session"
      >
        <LineChart
          label="Estimated vocabulary by day"
          unit=" words"
          data={p.vocabulary.map((v) => ({
            key: v.day,
            label: short(v.day),
            value: v.size,
          }))}
        />
      </ChartCard>

      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard title="Minutes per week" subtitle="Attentive practice, last 8 weeks">
          <ColumnChart
            label="Minutes per week"
            unit=" min"
            goal={{ value: p.goalMinutes, label: `Goal ${p.goalMinutes}` }}
            emphasis={thisWeek.start}
            xLabelEvery={2}
            data={p.minutesByWeek.map((m) => ({
              key: m.start,
              label: short(m.start),
              value: m.minutes,
              detail: `Week of ${short(m.start)}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="Accuracy per week" subtitle="Answers right on the first try">
          <LineChart
            label="Accuracy per week"
            unit="%"
            domain={[0, 100]}
            height={180}
            data={p.minutesByWeek.map((m) => ({
              key: m.start,
              label: short(m.start),
              value: m.accuracy,
              detail: `Week of ${short(m.start)}`,
            }))}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Words learned by level"
        subtitle="Level 1 holds the most common words; each level up is rarer"
      >
        {p.learnedByLevel.length === 0 ? (
          <p className={muted}>
            None yet. A word counts as learned after a successful review at least 7 days later.
          </p>
        ) : (
          <BarList
            items={p.learnedByLevel.map((l) => ({
              key: String(l.level),
              label: `Level ${l.level}`,
              value: l.words,
              max: maxLevel,
              valueLabel: `${l.words} ${l.words === 1 ? "word" : "words"}`,
            }))}
          />
        )}
      </ChartCard>
    </main>
  );
}
