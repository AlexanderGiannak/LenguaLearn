import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassNav } from "@/app/teacher/class-nav";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { weekWindow } from "@/lib/teacher/week";
import { Grades } from "./grades";

export const metadata: Metadata = { title: "Grades · LenguaLearn" };

export default function GradesPage({ params }: PageProps<"/teacher/class/[id]/grades">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/teacher/class/[id]/grades">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}/grades`);
  const data = await orNotFound(async () => {
    const c = await scope.getClass(id);
    const range = weekWindow(new Date(), {
      resetDay: c.weekResetDay,
      resetTime: c.weekResetTime,
      timeZone: c.timeZone,
    });
    return { c, grades: await scope.gradeRows(id, range) };
  });
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <ClassNav classId={id} className={data.c.name} current="grades" />
      <Grades classId={id} initial={data.grades} />
    </main>
  );
}
