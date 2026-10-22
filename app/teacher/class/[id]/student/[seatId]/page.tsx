import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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
  const maxMinutes = Math.max(1, ...d.minutesPerDay.map((m) => m.minutes));
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
      <ClassNav classId={id} className={c.name} current="" />
      <h2 className="text-2xl font-extrabold">
        Seat {d.seatNumber} <SeatLabel classId={id} seatId={seatId} fallback={d.handle ?? ""} />
      </h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Current level", String(d.level)],
          ["Words learned", String(d.learned)],
          ["In progress", String(d.inProgress)],
          ["Handle", d.handle ?? "–"],
        ].map(([label, v]) => (
          <div key={label} className="card p-3">
            <dt className={`text-sm ${muted}`}>{label}</dt>
            <dd className="text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="minutes-h">
        <h3 id="minutes-h" className="text-lg font-semibold">
          Minutes per day, last 4 weeks
        </h3>
        <div
          className="mt-3 flex h-32 items-end gap-1"
          role="img"
          aria-label={`Minutes per day: ${d.minutesPerDay.map((m) => `${m.day} ${m.minutes}`).join(", ")}`}
        >
          {d.minutesPerDay.map((m) => (
            <div
              key={m.day}
              title={`${m.day}: ${m.minutes} min`}
              className="flex-1 rounded-t-md bg-brand-500"
              style={{
                height: `${(100 * m.minutes) / maxMinutes}%`,
                minHeight: m.minutes > 0 ? 2 : 0,
              }}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="acc-h">
        <h3 id="acc-h" className="text-lg font-semibold">
          Accuracy by week
        </h3>
        <ol className="mt-2 flex gap-4">
          {d.accuracyByWeek.map((w) => (
            <li key={w.start} className="flex flex-col">
              <span className={`text-sm ${muted}`}>
                {new Date(w.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="text-lg font-semibold">
                {w.accuracy === null ? "–" : `${w.accuracy}%`}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="missed-h">
        <h3 id="missed-h" className="text-lg font-semibold">
          Most-missed words
        </h3>
        {d.mostMissed.length === 0 ? (
          <p className={muted}>None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-ink-200 dark:divide-ink-800">
            {d.mostMissed.map((m) => (
              <li key={m.display} className="flex justify-between py-2">
                <span>
                  <span lang="es" className="font-medium">
                    {m.display}
                  </span>{" "}
                  <span className={muted}>{m.gloss}</span>
                </span>
                <span className={muted}>
                  missed {m.missed} of {m.answered}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="integrity-h">
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
