import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClassNav } from "@/app/teacher/class-nav";
import { isUuid, orNotFound, teacherPage } from "@/lib/teacher/page-gate";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Dashboard · LenguaLearn" };

export default function DashboardPage({ params }: PageProps<"/teacher/class/[id]">) {
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/teacher/class/[id]">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await teacherPage(`/teacher/class/${id}`);
  const data = await orNotFound(() => scope.dashboard(id));
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-10">
      <ClassNav classId={id} className={data.class.name} current="" />
      <Dashboard initial={data} />
    </main>
  );
}
