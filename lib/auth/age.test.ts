import { describe, expect, it } from "vitest";
import { AGE_COOKIE, ageCookieValue, hasAgeConfirmation } from "./age";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";
const now = 1_800_000_000_000;

describe("age confirmation cookie", () => {
  it("accepts a fresh, genuine confirmation", () => {
    expect(
      hasAgeConfirmation(`a=1; ${AGE_COOKIE}=${ageCookieValue(SECRET, now)}`, SECRET, now + 1000),
    ).toBe(true);
  });
  it("expires after 10 minutes", () => {
    expect(
      hasAgeConfirmation(`${AGE_COOKIE}=${ageCookieValue(SECRET, now)}`, SECRET, now + 11 * 60_000),
    ).toBe(false);
  });
  it.each([
    ["missing", null],
    ["forged", `${AGE_COOKIE}=${now}.forged`],
    ["other secret", `${AGE_COOKIE}=${ageCookieValue("other", now)}`],
  ])("rejects a %s cookie", (_label, header) => {
    expect(hasAgeConfirmation(header, SECRET, now)).toBe(false);
  });
});
