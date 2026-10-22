import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassNav } from "@/app/teacher/class-nav";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { PrintButton } from "../cards/print-button";

export const metadata: Metadata = { title: "Class insights · LenguaLearn" };

export default function InsightsPage({ params }: PageProps<"/teacher/class/[id]/insights">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/teacher/class/[id]/insights">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}/insights`);
  const [c, words] = await orNotFound(() => Promise.all([scope.getClass(id), scope.insights(id)]));
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <ClassNav classId={id} className={c.name} current="insights" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-ink-600 dark:text-ink-400">
          The words this class missed most in the last 4 weeks, with the wrong answer chosen most.
          Use it to plan what to reteach.
        </p>
        <PrintButton label="Print word list" />
      </div>
      <h2 className="hidden text-2xl font-extrabold print:block">{c.name}: words to review</h2>
      {words.length === 0 ? (
        <p className="text-ink-600 dark:text-ink-400">Nothing missed yet.</p>
      ) : (
        <table className="w-full text-left">
          <thead className="text-sm text-ink-600 dark:text-ink-400">
            <tr>
              <th className="py-2 pr-3">Word</th>
              <th className="py-2 pr-3">Meaning</th>
              <th className="py-2 pr-3 print:hidden">Missed</th>
              <th className="py-2 print:hidden">Most-chosen wrong answer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {words.map((w) => (
              <tr key={w.senseId}>
                <td lang="es" className="py-2 pr-3 font-medium">
                  {w.display}
                </td>
                <td className="py-2 pr-3">{w.gloss}</td>
                <td className="py-2 pr-3 print:hidden">
                  {w.missed} of {w.answered}
                </td>
                <td className="py-2 print:hidden">{w.topWrongAnswer ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
