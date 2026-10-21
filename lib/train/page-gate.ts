import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, type CurrentUser } from "@/lib/auth/session";
import { needsPlacement } from "./placement";

/** For learner pages: the signed-in learner or student, placed; otherwise a redirect. */
export async function learnerPage(
  next: string,
  opts: { allowUnplaced?: boolean } = {},
): Promise<CurrentUser> {
  const u = await currentUser(await headers());
  if (!u) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (u.role === "teacher" && next !== "/train") redirect("/teacher");
  if (!opts.allowUnplaced && (await needsPlacement(u.id, u.role))) redirect("/placement");
  return u;
}
