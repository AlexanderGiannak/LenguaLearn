import { describe, expect, it } from "vitest";
import { fixturesAllowed, hashAdminToken, isBrowserRequest, verifyAdminToken } from "./auth";

const TOKEN = "test-token-0123456789abcdef0123456789abcdef";
const HASH = hashAdminToken(TOKEN);

describe("verifyAdminToken", () => {
  it("accepts the right bearer token", () => {
    expect(verifyAdminToken(`Bearer ${TOKEN}`, HASH)).toBe(true);
  });

  it.each([
    ["no header", null],
    ["empty header", ""],
    ["wrong token", "Bearer not-the-token"],
    ["missing scheme", TOKEN],
    ["wrong scheme", `Basic ${TOKEN}`],
    ["empty token", "Bearer "],
  ])("rejects %s", (_label, header) => {
    expect(verifyAdminToken(header, HASH)).toBe(false);
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["not a sha-256 hex digest", "abc123"],
  ])("rejects everything when the configured hash is %s", (_label, hash) => {
    expect(verifyAdminToken(`Bearer ${TOKEN}`, hash)).toBe(false);
  });

  it("accepts a configured hash in upper case", () => {
    expect(verifyAdminToken(`Bearer ${TOKEN}`, HASH.toUpperCase())).toBe(true);
  });
});

describe("isBrowserRequest", () => {
  it("treats a request with an Origin header as coming from a browser", () => {
    const req = new Request("http://localhost/api/admin/import", {
      method: "POST",
      headers: { origin: "http://localhost" },
    });
    expect(isBrowserRequest(req)).toBe(true);
  });

  it("treats a request without Origin as a script", () => {
    expect(isBrowserRequest(new Request("http://localhost/api/admin/import"))).toBe(false);
  });
});

describe("fixturesAllowed", () => {
  it.each([
    ["local and CI (no Railway environment)", {}, true],
    ["a Railway PR environment", { RAILWAY_ENVIRONMENT_NAME: "LenguaLearn-pr-12" }, true],
    ["Railway production", { RAILWAY_ENVIRONMENT_NAME: "production" }, false],
    ["any other Railway environment", { RAILWAY_ENVIRONMENT_NAME: "staging" }, false],
    [
      "production running as the demo site",
      { RAILWAY_ENVIRONMENT_NAME: "production", DEMO_SITE: "1" },
      true,
    ],
    [
      "production with demo mode set to anything else",
      { RAILWAY_ENVIRONMENT_NAME: "production", DEMO_SITE: "true" },
      false,
    ],
  ])("%s -> %s", (_label, env, expected) => {
    expect(fixturesAllowed(env)).toBe(expected);
  });
});
