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

const muted = "text-zinc-600 dark:text-zinc-400";

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
      <h2 className="text-2xl font-semibold">
        Seat {d.seatNumber} <SeatLabel classId={id} seatId={seatId} fallback={d.handle ?? ""} />
      </h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Current level", String(d.level)],
          ["Words learned", String(d.learned)],
          ["In progress", String(d.inProgress)],
          ["Handle", d.handle ?? "–"],
        ].map(([label, v]) => (
          <div key={label} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
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
              className="flex-1 rounded-t bg-zinc-800 dark:bg-zinc-200"
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
          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
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
        {d.integrityEvents.length === 0 ? <p className={muted}>None.</p> : null}
      </section>
    </main>
  );
}
