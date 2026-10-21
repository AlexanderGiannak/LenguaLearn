import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { ClassNav } from "@/app/teacher/class-nav";
import { getDb } from "@/lib/db/client";
import { wordList } from "@/lib/db/schema";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { ClassSettings } from "./class-settings";

export const metadata: Metadata = { title: "Class settings · LenguaLearn" };

export default function SettingsPage({ params }: PageProps<"/teacher/class/[id]/settings">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/teacher/class/[id]/settings">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}/settings`);
  const [c, dashboard] = await orNotFound(() =>
    Promise.all([scope.getClass(id), scope.dashboard(id)]),
  );
  const lists = await getDb()
    .select({ id: wordList.id, name: wordList.name })
    .from(wordList)
    .where(eq(wordList.status, "live"))
    .orderBy(asc(wordList.name));
  const students = dashboard.rows.flatMap((r) =>
    r.joined
      ? [{ seatId: r.seatId, seatNumber: r.seatNumber, handle: r.handle, startLevel: r.startLevel }]
      : [],
  );
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
      <ClassNav classId={id} className={c.name} current="settings" />
      <ClassSettings
        classId={id}
        lists={lists}
        students={students}
        initial={{
          name: c.name,
          weeklyGoalMinutes: c.weeklyGoalMinutes,
          weekResetDay: c.weekResetDay,
          weekResetTime: c.weekResetTime,
          timeZone: c.timeZone,
          sessionMinutes: c.sessionMinutes,
          focusListId: c.focusListId,
        }}
      />
    </main>
  );
}
