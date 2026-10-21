import { describe, expect, it } from "vitest";
import { newDeviceCookie, verifyDeviceCookie } from "./device";

const SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";

describe("device cookie", () => {
  it("round-trips a genuine cookie", () => {
    const cookie = newDeviceCookie(SECRET);
    expect(verifyDeviceCookie(cookie, SECRET)).toBe(cookie.split(".")[0]);
  });

  it("is random", () => {
    expect(newDeviceCookie(SECRET)).not.toBe(newDeviceCookie(SECRET));
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["no signature", "abc"],
    ["forged signature", "abc.def"],
  ])("rejects a %s cookie", (_label, value) => {
    expect(verifyDeviceCookie(value, SECRET)).toBeNull();
  });

  it("rejects a cookie signed with another secret", () => {
    expect(verifyDeviceCookie(newDeviceCookie("other-secret"), SECRET)).toBeNull();
  });
});
