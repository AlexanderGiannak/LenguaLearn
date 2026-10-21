import { describe, expect, it } from "vitest";
import { checkTiming, signQuestionToken, verifyQuestionToken } from "./server";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const issuedAt = new Date("2026-10-21T15:00:00.000Z");

describe("question tokens", () => {
  it("verify for the question and issue time they were made for", () => {
    const t = signQuestionToken("q-1", issuedAt, SECRET);
    expect(verifyQuestionToken(t, "q-1", issuedAt, SECRET)).toBe(true);
  });
  it.each([
    ["another question", "q-2", issuedAt, SECRET],
    ["another issue time", "q-1", new Date(issuedAt.getTime() + 1), SECRET],
    ["another secret", "q-1", issuedAt, "other-secret"],
  ] as const)("fail for %s", (_label, id, at, secret) => {
    const t = signQuestionToken("q-1", issuedAt, SECRET);
    expect(verifyQuestionToken(t, id, at, secret)).toBe(false);
  });
  it("fail when missing or malformed", () => {
    expect(verifyQuestionToken(undefined, "q-1", issuedAt, SECRET)).toBe(false);
    expect(verifyQuestionToken("garbage", "q-1", issuedAt, SECRET)).toBe(false);
  });
});

describe("checkTiming", () => {
  const at = (ms: number) => new Date(issuedAt.getTime() + ms);

  it("accepts honest timing as reported", () => {
    expect(
      checkTiming({ issuedAt, receivedAt: at(9000), responseMs: 4000, activeMs: 8000 }),
    ).toEqual({
      ok: true,
      responseMs: 4000,
      activeMs: 8000,
    });
  });

  it("rejects an answer that arrives impossibly soon after the question was issued", () => {
    expect(checkTiming({ issuedAt, receivedAt: at(150), responseMs: 100, activeMs: 100 }).ok).toBe(
      false,
    );
  });

  it("uses the server's time when the client claims more time than has passed", () => {
    const r = checkTiming({ issuedAt, receivedAt: at(5000), responseMs: 30_000, activeMs: 60_000 });
    expect(r).toEqual({ ok: true, responseMs: 5000, activeMs: 5000 });
  });

  it("allows small clock differences", () => {
    const r = checkTiming({ issuedAt, receivedAt: at(5000), responseMs: 6500, activeMs: 6500 });
    expect(r).toEqual({ ok: true, responseMs: 6500, activeMs: 6500 });
  });
});
