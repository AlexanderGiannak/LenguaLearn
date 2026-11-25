import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AuthError, requireUser } from "@/lib/auth/session";
import { reviewerFor, type Reviewer } from "./access";

/** For review pages: the reviewer, a redirect to sign in, or not found for everyone else. */
export async function reviewerPage(next: string): Promise<Reviewer> {
  let u;
  try {
    u = await requireUser(await headers(), ["teacher", "admin"]);
  } catch (e) {
    if (e instanceof AuthError && e.status === 403) notFound();
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  try {
    return await reviewerFor(u);
  } catch {
    notFound();
  }
}
