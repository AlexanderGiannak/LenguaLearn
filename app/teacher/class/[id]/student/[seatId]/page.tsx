import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BarList, ChartCard, ColumnChart, StatTile } from "@/app/_components/charts";
import { ClassNav } from "@/app/teacher/class-nav";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { SeatLabel } from "./seat-label";

export const metadata: Metadata = { title: "Student · LenguaLearn" };

export default function StudentPage({ params }: PageProps<"/teacher/class/[id]/student/[seatId]">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

const muted = "text-ink-600 dark:text-ink-400";

const short = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: iso.length === 10 ? "UTC" : undefined,
  });
const long = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const REASONS: Record<string, string> = {
  fast: "Answers faster than reading time, mostly wrong",
  same_position: "Same answer position chosen again and again while wrong",
  hidden_tab: "Answered right after coming back from another tab",
};

async function Content({
  params,
}: Pick<PageProps<"/teacher/class/[id]/student/[seatId]">, "params">) {
  const { id, seatId } = await params;
  if (!isUuid(id) || !isUuid(seatId)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}/student/${seatId}`);
  const [c, d] = await orNotFound(() =>
    Promise.all([scope.getClass(id), scope.studentDetail(id, seatId)]),
  );
  const total = d.minutesPerDay.reduce((n, m) => n + m.minutes, 0);
  const daysActive = d.minutesPerDay.filter((m) => m.minutes > 0).length;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <ClassNav classId={id} className={c.name} current="" />
      <h2 className="text-2xl font-extrabold">
        Seat {d.seatNumber} <SeatLabel classId={id} seatId={seatId} fallback={d.handle ?? ""} />
      </h2>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Current level" value={d.level} note="Where new words come from" />
        <StatTile label="Words learned" value={d.learned} note="Right after a week or more" />
        <StatTile label="In progress" value={d.inProgress} note="Met, not yet learned" />
        <StatTile
          label="Minutes, 4 weeks"
          value={Math.round(total)}
          note={`${daysActive} ${daysActive === 1 ? "day" : "days"} with practice`}
        />
      </dl>

      <ChartCard title="Minutes per day" subtitle="Last 4 weeks, including flagged time">
        <ColumnChart
          label="Minutes per day, last 4 weeks"
          unit=" min"
          xLabelEvery={7}
          emphasis={d.minutesPerDay.at(-1)?.day}
          data={d.minutesPerDay.map((m) => ({
            key: m.day,
            label: short(m.day),
            value: m.minutes,
            detail: long(m.day),
          }))}
        />
      </ChartCard>

      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard title="Accuracy by week" subtitle="Answers right on the first try">
          <ColumnChart
            label="Accuracy by week"
            unit="%"
            height={170}
            emphasis={d.accuracyByWeek.at(-1)?.start}
            data={d.accuracyByWeek.map((w) => ({
              key: w.start,
              label: short(w.start),
              value: w.accuracy,
              detail: `Week of ${short(w.start)}`,
            }))}
          />
        </ChartCard>
        <ChartCard title="Most-missed words" subtitle="Share of answers missed, all time">
          {d.mostMissed.length === 0 ? (
            <p className={muted}>None yet.</p>
          ) : (
            <BarList
              items={d.mostMissed.map((m) => ({
                key: m.display,
                label: (
                  <>
                    <span lang="es" className="font-semibold">
                      {m.display}
                    </span>{" "}
                    <span className={muted}>{m.gloss}</span>
                  </>
                ),
                value: m.missed / Math.max(1, m.answered),
                max: 1,
                valueLabel: `${m.missed} of ${m.answered}`,
              }))}
            />
          )}
        </ChartCard>
      </div>

      <section aria-labelledby="integrity-h" className="card p-5">
        <h3 id="integrity-h" className="text-lg font-semibold">
          Integrity events
        </h3>
        {d.integrityEvents.length === 0 ? (
          <p className={muted}>None in the last 4 weeks.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-200 dark:divide-ink-800">
            {d.integrityEvents.map((e) => (
              <li key={`${e.at}-${e.reason}`} className="flex justify-between gap-4 py-2">
                <span>{REASONS[e.reason]}</span>
                <span className={muted}>
                  {new Date(e.at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  · {e.answers} answers, {e.minutes} min flagged
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={`mt-2 text-sm ${muted}`}>
          These are patterns, not accusations. Flagged minutes do not count toward the goal.
        </p>
      </section>
    </main>
  );
}
