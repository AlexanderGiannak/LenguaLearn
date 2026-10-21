import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthError, requireUser } from "@/lib/auth/session";
import { NotFound, teacherScope } from "@/lib/teacher/scope";
import { Seats } from "./seats";

export const metadata: Metadata = { title: "Class · LenguaLearn" };

export default function ClassPage({ params }: PageProps<"/teacher/class/[id]">) {
  return (
    <Suspense>
      <ClassSeats params={params} />
    </Suspense>
  );
}

async function ClassSeats({ params }: Pick<PageProps<"/teacher/class/[id]">, "params">) {
  const { id } = await params;
  let teacherId: string;
  try {
    teacherId = (await requireUser(await headers(), ["teacher"])).id;
  } catch (e) {
    if (e instanceof AuthError && e.status === 403) redirect("/settings?verify=1");
    redirect(`/sign-in?next=/teacher/class/${id}`);
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const scope = teacherScope(teacherId);
  let data;
  try {
    const c = await scope.getClass(id);
    data = { classId: c.id, className: c.name, initialSeats: await scope.listSeats(id) };
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  return <Seats {...data} />;
}
