import { createHmac, timingSafeEqual } from "node:crypto";

// Google sign-up must confirm 13 or older, like the password sign-up (spec: Roles). Ticking
// the box on the sign-up page sets this short-lived signed cookie; Better Auth refuses to
// create a Google account without it.

export const AGE_COOKIE = "ll_age_ok";
const MAX_AGE_S = 10 * 60;

const sign = (ts: string, secret: string) =>
  createHmac("sha256", secret).update(`age.${ts}`).digest("base64url");

export function ageCookieValue(secret: string, now = Date.now()): string {
  const ts = String(now);
  return `${ts}.${sign(ts, secret)}`;
}

export function ageCookieHeader(value: string, secure: boolean): string {
  return `${AGE_COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** True if the request carries a genuine, recent age confirmation. */
export function hasAgeConfirmation(
  cookieHeader: string | null,
  secret: string,
  now = Date.now(),
): boolean {
  const raw = (cookieHeader ?? "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${AGE_COOKIE}=`))
    ?.slice(AGE_COOKIE.length + 1);
  if (!raw) return false;
  const [ts, mac] = raw.split(".");
  if (!ts || !mac) return false;
  const expected = Buffer.from(sign(ts, secret));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  const age = now - Number(ts);
  return age >= 0 && age <= MAX_AGE_S * 1000;
}
