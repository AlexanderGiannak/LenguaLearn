import { eq } from "drizzle-orm";
import { AuthError, requireUser, type CurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

// Who may use the review tool (spec: Content pipeline, step 4; owner, 2026-11-25):
// the admin, and teachers the admin made reviewers. Reviewers edit, approve and reject;
// only the admin publishes. Review pages show content only, never student data.

export type Reviewer = { id: string; isAdmin: boolean };

export async function reviewerFor(u: CurrentUser): Promise<Reviewer> {
  if (u.role === "admin") return { id: u.id, isAdmin: true };
  if (u.role !== "teacher") throw new AuthError(403, "not allowed for this account");
  if (!u.emailVerified) throw new AuthError(403, "confirm your email address first");
  const [row] = await getDb()
    .select({ canReview: user.canReview })
    .from(user)
    .where(eq(user.id, u.id));
  if (!row?.canReview) throw new AuthError(403, "not a reviewer");
  return { id: u.id, isAdmin: false };
}

export async function requireReviewer(headers: Headers): Promise<Reviewer> {
  return reviewerFor(await requireUser(headers, ["teacher", "admin"]));
}

export function requireAdmin(r: Reviewer): void {
  if (!r.isAdmin) throw new AuthError(403, "only the admin can do this");
}

/**
 * Admin API: makes a verified teacher a reviewer, or takes it back. Returns the user's ID
 * for the admin action log, or an error the admin can act on.
 */
export async function setReviewer(
  email: string,
  canReview: boolean,
): Promise<{ id: string } | { error: string }> {
  const [row] = await getDb()
    .select({ id: user.id, role: user.role, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!row) return { error: "no account with that email" };
  if (row.role !== "teacher") return { error: "only teacher accounts can be reviewers" };
  if (canReview && !row.emailVerified)
    return { error: "the teacher has not confirmed their email" };
  await getDb().update(user).set({ canReview }).where(eq(user.id, row.id));
  return { id: row.id };
}
