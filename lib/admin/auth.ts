import { createHash, timingSafeEqual } from "node:crypto";

// The admin API (content import and status changes) is called by scripts on the owner's
// laptop, not by browsers, so it uses a bearer token instead of a login session. The
// server stores only the token's SHA-256 hash (ADMIN_API_TOKEN_HASH). A fast hash is fine
// here because the token is 32 random bytes, not a password someone could guess.

export function hashAdminToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyAdminToken(
  authorization: string | null,
  expectedHash: string | undefined,
): boolean {
  if (!expectedHash || !/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const match = /^Bearer (\S+)$/.exec(authorization ?? "");
  if (!match) return false;
  const actual = Buffer.from(hashAdminToken(match[1]!), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}

/**
 * Browsers always send Origin on POST. The admin API is script-only, so any request with
 * an Origin header is refused. That rules out cross-site requests without needing an
 * allowlist of our own domains.
 */
export function isBrowserRequest(request: Request): boolean {
  return request.headers.has("origin");
}

/**
 * Fixture content (AI-written test words) may load locally, in CI, and in Railway PR
 * environments, never in production or any other named environment.
 */
export function fixturesAllowed(env: Record<string, string | undefined>): boolean {
  const name = env.RAILWAY_ENVIRONMENT_NAME;
  return name === undefined || /-pr-\d+$/.test(name);
}
