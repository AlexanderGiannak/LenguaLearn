import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth/session";
import { NotFound, teacherScope } from "./scope";

/** For teacher pages: the teacher's scope, or a redirect to sign in or to confirm email. */
export async function teacherPage(next: string) {
  try {
    const u = await requireUser(await headers(), ["teacher"]);
    return teacherScope(u.id);
  } catch (e) {
    if (e instanceof AuthError && e.status === 403) redirect("/settings?verify=1");
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
}

/** Runs a scoped lookup, turning "not your class" into a 404 page. */
export async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
}

export const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
