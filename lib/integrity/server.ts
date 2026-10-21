import { createHmac, timingSafeEqual } from "node:crypto";
import { INTEGRITY_CONFIG as C } from "./config";

// Server-side checks (spec: Integrity, "Server-side checks"). Each question goes out with a
// token signed over its ID and issue time; an answer must bring a valid, unused one. Client
// timing is compared with the server's own issue and receive times. This stops simple
// scripts from farming minutes; it does not try to stop a determined cheater.

export function signQuestionToken(questionId: string, issuedAt: Date, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${questionId}.${issuedAt.getTime()}`)
    .digest("base64url");
}

export function verifyQuestionToken(
  token: string | undefined,
  questionId: string,
  issuedAt: Date,
  secret: string,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(signQuestionToken(questionId, issuedAt, secret));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The question was shown no earlier than it was issued (questions are prefetched), so the
 * time since issue bounds both the response time and the active time the client may claim.
 */
export function checkTiming(t: {
  issuedAt: Date;
  receivedAt: Date;
  responseMs: number;
  activeMs: number;
}): { ok: true; responseMs: number; activeMs: number } | { ok: false } {
  const elapsed = t.receivedAt.getTime() - t.issuedAt.getTime();
  if (elapsed < C.impossibleMs) return { ok: false };
  const bound = (ms: number) => (ms > elapsed + C.clockToleranceMs ? elapsed : ms);
  return { ok: true, responseMs: bound(t.responseMs), activeMs: bound(t.activeMs) };
}
