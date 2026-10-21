import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

const MIN = 60_000;

describe("RateLimiter", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    const rl = new RateLimiter(() => 0);
    for (let i = 0; i < 10; i++) expect(rl.hit("k", 10, 15 * MIN).allowed).toBe(true);
    const refused = rl.hit("k", 10, 15 * MIN);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBe(15 * MIN);
  });

  it("forgets attempts once they leave the window", () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    for (let i = 0; i < 10; i++) rl.hit("k", 10, 15 * MIN);
    now = 15 * MIN + 1;
    expect(rl.hit("k", 10, 15 * MIN).allowed).toBe(true);
  });

  it("slides: only the last 15 minutes count", () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    for (let i = 0; i < 5; i++) rl.hit("k", 10, 15 * MIN);
    now = 10 * MIN;
    for (let i = 0; i < 5; i++) rl.hit("k", 10, 15 * MIN);
    expect(rl.hit("k", 10, 15 * MIN).allowed).toBe(false);
    now = 15 * MIN + 1; // the first five have expired
    expect(rl.hit("k", 10, 15 * MIN).allowed).toBe(true);
  });

  it("keeps keys apart", () => {
    const rl = new RateLimiter(() => 0);
    for (let i = 0; i < 10; i++) rl.hit("a", 10, MIN);
    expect(rl.hit("b", 10, MIN).allowed).toBe(true);
  });

  it("can check without counting, and count separately", () => {
    const rl = new RateLimiter(() => 0);
    for (let i = 0; i < 3; i++) rl.record("fail", MIN);
    expect(rl.check("fail", 3, MIN).allowed).toBe(false);
    expect(rl.check("fail", 4, MIN).allowed).toBe(true);
  });

  it("drops empty keys so memory stays bounded", () => {
    let now = 0;
    const rl = new RateLimiter(() => now);
    for (let i = 0; i < 1000; i++) rl.hit(`k${i}`, 10, MIN);
    now = 2 * MIN;
    rl.sweep(MIN);
    expect(rl.size).toBe(0);
  });
});
