import { describe, expect, it } from "vitest";
import { AuthLimits } from "./limits";
import { RateLimiter } from "./rate-limit";

const fresh = () => new AuthLimits(new RateLimiter(() => 0));
const SCHOOL_IP = "203.0.113.7";

describe("login limits", () => {
  it("lets a whole class log in from one school IP within a minute", () => {
    const limits = fresh();
    for (let i = 0; i < 30; i++) {
      const who = { account: `student-${i}`, device: `chromebook-${i}`, ip: SCHOOL_IP };
      expect(limits.checkLogin(who).allowed).toBe(true);
    }
  });

  it("also when the class shares a few devices", () => {
    const limits = fresh();
    for (let i = 0; i < 30; i++) {
      expect(
        limits.checkLogin({ account: `s${i}`, device: `cart-${i % 3}`, ip: SCHOOL_IP }).allowed,
      ).toBe(true);
    }
  });

  it("stops guessing at one handle after 10 attempts in 15 minutes", () => {
    const limits = fresh();
    for (let i = 0; i < 10; i++) {
      expect(
        limits.checkLogin({ account: "quiet-otter-42", device: `d${i}`, ip: `198.51.100.${i}` })
          .allowed,
      ).toBe(true);
    }
    expect(
      limits.checkLogin({ account: "quiet-otter-42", device: "d99", ip: "198.51.100.99" }).allowed,
    ).toBe(false);
  });

  it("stops a device after 30 failed attempts, across accounts", () => {
    const limits = fresh();
    for (let i = 0; i < 30; i++) {
      const who = { account: `a${i}`, device: "laptop", ip: SCHOOL_IP };
      expect(limits.checkLogin(who).allowed).toBe(true);
      limits.recordLoginFailure(who);
    }
    expect(limits.checkLogin({ account: "a99", device: "laptop", ip: SCHOOL_IP }).allowed).toBe(
      false,
    );
    expect(limits.checkLogin({ account: "a99", device: "other", ip: SCHOOL_IP }).allowed).toBe(
      true,
    );
  });

  it("keeps only a high ceiling per IP", () => {
    const limits = fresh();
    for (let i = 0; i < 300; i++) {
      expect(limits.checkLogin({ account: `s${i}`, device: `d${i}`, ip: SCHOOL_IP }).allowed).toBe(
        true,
      );
    }
    expect(limits.checkLogin({ account: "s300", device: "d300", ip: SCHOOL_IP }).allowed).toBe(
      false,
    );
  });

  it("does not count a refused attempt against the other keys", () => {
    const limits = fresh();
    for (let i = 0; i < 11; i++) limits.checkLogin({ account: "x", device: `d${i}`, ip: "a" });
    // 10 counted toward the IP ceiling, not 11.
    for (let i = 0; i < 290; i++) limits.checkLogin({ account: `y${i}`, device: `e${i}`, ip: "a" });
    expect(limits.checkLogin({ account: "z", device: "f", ip: "a" }).allowed).toBe(false);
  });
});

describe("seat-code limits", () => {
  it("stops guessing at one code after 10 attempts", () => {
    const limits = fresh();
    for (let i = 0; i < 10; i++) {
      expect(
        limits.checkRedemption({ code: "K7QM4TPX", device: `d${i}`, ip: `i${i}` }).allowed,
      ).toBe(true);
    }
    expect(limits.checkRedemption({ code: "K7QM4TPX", device: "d", ip: "i" }).allowed).toBe(false);
  });

  it("stops a device that keeps entering wrong codes", () => {
    const limits = fresh();
    for (let i = 0; i < 30; i++) {
      const who = { code: `WRONG${i}`, device: "laptop", ip: SCHOOL_IP };
      limits.checkRedemption(who);
      limits.recordRedemptionFailure(who);
    }
    expect(
      limits.checkRedemption({ code: "K7QM4TPX", device: "laptop", ip: SCHOOL_IP }).allowed,
    ).toBe(false);
  });
});
