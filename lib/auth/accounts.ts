import { hash } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { account, classroom, seat, session, user } from "@/lib/db/schema";
import { getAuth } from "./auth";
import {
  generateHandle,
  learnerPlaceholderEmail,
  normalizeSeatCode,
  studentPlaceholderEmail,
} from "./identifiers";
import { authLimits } from "./limits";
import type { RequestContext } from "./request";
import type { CurrentUser } from "./session";

// Sign-up, sign-in and seat-code redemption. Each returns the Response Better Auth built
// (with its session cookie) or throws an AccountError the route turns into a message.

export class AccountError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// --- Teachers and independent learners -----------------------------------------------

export type SignUpInput =
  | { role: "teacher"; name: string; email: string; password: string }
  | {
      role: "learner";
      username: string;
      email?: string;
      password: string;
      /** Spec: independent learners must confirm they are 13 or older. */
      ageConfirmed: true;
    };

export async function signUp(input: SignUpInput): Promise<Response> {
  const auth = getAuth();
  const isTeacher = input.role === "teacher";
  const email = isTeacher ? input.email : (input.email ?? learnerPlaceholderEmail());
  let res: Response;
  try {
    res = await auth.api.signUpEmail({
      body: {
        email,
        password: input.password,
        name: isTeacher ? input.name : input.username,
        ...(isTeacher ? {} : { username: input.username }),
      },
      asResponse: true,
    });
  } catch {
    throw new AccountError(409, "That account could not be created. Try another name or email.");
  }
  if (!res.ok) {
    throw new AccountError(409, "That username or email is already taken.");
  }
  const created = (await res.clone().json()) as { user: { id: string } };
  await getDb()
    .update(user)
    .set({
      role: input.role,
      ...(isTeacher ? {} : { ageConfirmedAt: new Date() }),
      // A placeholder address has nothing to verify.
      ...(!isTeacher && !input.email ? { emailVerified: true } : {}),
    })
    .where(eq(user.id, created.user.id));
  return res;
}

export async function signIn(
  input: { identifier: string; password: string },
  ctx: RequestContext,
): Promise<Response> {
  const identifier = input.identifier.trim().toLowerCase();
  const limits = authLimits();
  if (!limits.checkLogin({ account: identifier, device: ctx.device, ip: ctx.ip }).allowed) {
    throw new AccountError(429, TOO_MANY);
  }
  const auth = getAuth();
  let res: Response | null = null;
  try {
    res = identifier.includes("@")
      ? await auth.api.signInEmail({
          body: { email: identifier, password: input.password },
          asResponse: true,
        })
      : await auth.api.signInUsername({
          body: { username: identifier, password: input.password },
          asResponse: true,
        });
  } catch {
    res = null;
  }
  if (!res?.ok) {
    limits.recordLoginFailure({ device: ctx.device, ip: ctx.ip });
    throw new AccountError(401, "That name and password don't match.");
  }
  return res;
}

// --- Class students: seat codes ------------------------------------------------------

async function findSeat(code: string) {
  const [row] = await getDb()
    .select({ seat, className: classroom.name })
    .from(seat)
    .innerJoin(classroom, eq(seat.classroomId, classroom.id))
    .where(eq(seat.code, code));
  return row ?? null;
}

function limitedCode(rawCode: string, ctx: RequestContext): string {
  const code = normalizeSeatCode(rawCode);
  const limits = authLimits();
  if (!limits.checkRedemption({ code: code ?? rawCode, device: ctx.device, ip: ctx.ip }).allowed) {
    throw new AccountError(429, TOO_MANY);
  }
  if (!code) {
    limits.recordRedemptionFailure({ device: ctx.device, ip: ctx.ip });
    throw new AccountError(404, "That code doesn't work. Check it with your teacher.");
  }
  return code;
}

/** Looks up a code before the student chooses a password. Counts toward the code limits. */
export async function checkSeatCode(rawCode: string, ctx: RequestContext) {
  const code = limitedCode(rawCode, ctx);
  const found = await findSeat(code);
  if (!found) {
    authLimits().recordRedemptionFailure({ device: ctx.device, ip: ctx.ip });
    throw new AccountError(404, "That code doesn't work. Check it with your teacher.");
  }
  return { kind: found.seat.codeKind!, className: found.className };
}

/**
 * Redeems a join code. With no one signed in, creates a class student with a random handle.
 * A signed-in class student is linked to the new seat instead (changing classes). A signed-in
 * teacher or independent learner is refused: their account carries a real name or email,
 * which a class must never receive.
 */
export async function redeemJoinCode(
  input: { code: string; password?: string },
  signedIn: CurrentUser | null,
  ctx: RequestContext,
): Promise<{ handle: string; response: Response | null }> {
  const code = limitedCode(input.code, ctx);
  if (signedIn && signedIn.role !== "student") {
    throw new AccountError(
      403,
      "Sign out first. Teacher and personal accounts can't join a class with a code.",
    );
  }
  const found = await findSeat(code);
  if (!found || found.seat.codeKind !== "join") {
    authLimits().recordRedemptionFailure({ device: ctx.device, ip: ctx.ip });
    throw new AccountError(404, "That code doesn't work. Check it with your teacher.");
  }

  if (signedIn) {
    await claimSeat(code, signedIn.id);
    return { handle: signedIn.username ?? signedIn.name, response: null };
  }

  if (!input.password) throw new AccountError(400, "Choose a password.");
  const auth = getAuth();
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = generateHandle();
    const res = await auth.api
      .signUpEmail({
        body: {
          email: studentPlaceholderEmail(),
          password: input.password,
          name: handle,
          username: handle,
        },
        asResponse: true,
      })
      .catch(() => null);
    if (!res?.ok) continue; // most likely a handle collision: try another
    const created = (await res.clone().json()) as { user: { id: string } };
    await getDb()
      .update(user)
      .set({ role: "student", emailVerified: true })
      .where(eq(user.id, created.user.id));
    try {
      await claimSeat(code, created.user.id);
    } catch (error) {
      // Someone else redeemed the code first: remove the account we just made.
      await getDb().delete(user).where(eq(user.id, created.user.id));
      throw error;
    }
    return { handle, response: res };
  }
  throw new AccountError(409, "Could not create an account right now. Try again.");
}

async function claimSeat(code: string, studentId: string): Promise<void> {
  const claimed = await getDb().transaction(async (tx) => {
    const rows = await tx
      .update(seat)
      .set({ studentId, code: null, codeKind: null, joinedAt: new Date() })
      .where(and(eq(seat.code, code), eq(seat.codeKind, "join"), isNull(seat.studentId)))
      .returning({ id: seat.id });
    if (rows.length === 0) return false;
    await tx.update(user).set({ scheduledDeletionAt: null }).where(eq(user.id, studentId));
    return true;
  });
  if (!claimed)
    throw new AccountError(409, "That code was just used. Ask your teacher for a new one.");
}

/**
 * Redeems a reset code: the student of that seat sets a new password and keeps their
 * progress. Other sessions of that account are signed out.
 */
export async function redeemResetCode(
  input: { code: string; password: string },
  ctx: RequestContext,
): Promise<{ handle: string; response: Response }> {
  const code = limitedCode(input.code, ctx);
  const found = await findSeat(code);
  if (!found || found.seat.codeKind !== "reset" || !found.seat.studentId) {
    authLimits().recordRedemptionFailure({ device: ctx.device, ip: ctx.ip });
    throw new AccountError(404, "That code doesn't work. Check it with your teacher.");
  }
  const studentId = found.seat.studentId;
  const passwordHash = await hash(input.password, ARGON2);
  const handle = await getDb().transaction(async (tx) => {
    const rows = await tx
      .update(seat)
      .set({ code: null, codeKind: null })
      .where(and(eq(seat.code, code), eq(seat.codeKind, "reset")))
      .returning({ id: seat.id });
    if (rows.length === 0) throw new AccountError(409, "That code was just used.");
    await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, studentId), eq(account.providerId, "credential")));
    await tx.delete(session).where(eq(session.userId, studentId));
    const [u] = await tx
      .select({ username: user.username })
      .from(user)
      .where(eq(user.id, studentId));
    return u!.username!;
  });
  const response = await getAuth().api.signInUsername({
    body: { username: handle, password: input.password },
    asResponse: true,
  });
  return { handle, response };
}
