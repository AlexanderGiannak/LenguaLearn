import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthError, requireUser } from "@/lib/auth/session";
import { teacherScope } from "@/lib/teacher/scope";
import { ClassList } from "./class-list";

export const metadata: Metadata = { title: "Your classes · LenguaLearn" };

export default function TeacherPage() {
  return (
    <Suspense>
      <Classes />
    </Suspense>
  );
}

async function Classes() {
  let teacherId: string;
  try {
    teacherId = (await requireUser(await headers(), ["teacher"])).id;
  } catch (e) {
    if (e instanceof AuthError && e.status === 403) redirect("/settings?verify=1");
    redirect("/sign-in?next=/teacher");
  }
  const classes = await teacherScope(teacherId).listClasses();
  return <ClassList classes={classes} />;
}
