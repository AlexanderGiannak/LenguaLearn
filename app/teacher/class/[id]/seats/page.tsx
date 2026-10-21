import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { ClassNav } from "@/app/teacher/class-nav";
import { Seats } from "./seats";

export const metadata: Metadata = { title: "Seats · LenguaLearn" };

export default function SeatsPage({ params }: PageProps<"/teacher/class/[id]/seats">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/teacher/class/[id]/seats">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}/seats`);
  const data = await orNotFound(async () => {
    const c = await scope.getClass(id);
    return { classId: c.id, className: c.name, initialSeats: await scope.listSeats(id) };
  });
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <ClassNav classId={id} className={data.className} current="seats" />
      <Seats {...data} />
    </main>
  );
}
