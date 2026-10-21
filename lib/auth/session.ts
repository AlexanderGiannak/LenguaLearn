import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { user, type Role } from "@/lib/db/schema";
import { getAuth } from "./auth";

// Who is making a request. Roles are read from the database on every call, so a role change
// takes effect at once.

export type CurrentUser = {
  id: string;
  role: Role;
  name: string;
  username: string | null;
  email: string;
  emailVerified: boolean;
};

export async function currentUser(headers: Headers): Promise<CurrentUser | null> {
  const result = await getAuth().api.getSession({ headers });
  if (!result) return null;
  const [row] = await getDb()
    .select({
      id: user.id,
      role: user.role,
      name: user.name,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, result.user.id));
  return row ?? null;
}

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The current user, if they have one of `roles`. Teachers must have a verified email
 * before they can use teacher features (spec: Roles).
 */
export async function requireUser(headers: Headers, roles: readonly Role[]): Promise<CurrentUser> {
  const u = await currentUser(headers);
  if (!u) throw new AuthError(401, "sign in first");
  if (!roles.includes(u.role)) throw new AuthError(403, "not allowed for this account");
  if (u.role === "teacher" && !u.emailVerified) {
    throw new AuthError(403, "confirm your email address first");
  }
  return u;
}
