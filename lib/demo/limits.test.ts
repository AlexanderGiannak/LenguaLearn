import { describe, expect, it } from "vitest";
import { DemoLimits } from "./limits";

const HOUR = 3_600_000;

function setup(limits = { perDevice: 3, learnersSiteWide: 5, teachersSiteWide: 2 }) {
  let t = 0;
  const demo = new DemoLimits(() => t, limits);
  return { demo, advance: (ms: number) => (t += ms) };
}

describe("demo start limits", () => {
  it("lets one browser start up to its cap, across both buttons, then refuses", () => {
    const { demo } = setup();
    expect(demo.allow("learner", "a").ok).toBe(true);
    expect(demo.allow("teacher", "a").ok).toBe(true);
    expect(demo.allow("learner", "a").ok).toBe(true);
    expect(demo.allow("learner", "a").ok).toBe(false);
    expect(demo.allow("teacher", "a").ok).toBe(false);
    // Another browser is unaffected.
    expect(demo.allow("learner", "b").ok).toBe(true);
  });

  it("caps each button site-wide, separately", () => {
    const { demo } = setup();
    expect(demo.allow("teacher", "a").ok).toBe(true);
    expect(demo.allow("teacher", "b").ok).toBe(true);
    expect(demo.allow("teacher", "c").ok).toBe(false);
    // The learner quota is separate.
    for (const d of ["c", "d", "e", "f", "g"]) expect(demo.allow("learner", d).ok).toBe(true);
    expect(demo.allow("learner", "h").ok).toBe(false);
  });

  it("does not count a refused start", () => {
    const { demo } = setup({ perDevice: 10, learnersSiteWide: 5, teachersSiteWide: 1 });
    expect(demo.allow("teacher", "a").ok).toBe(true);
    expect(demo.allow("teacher", "a").ok).toBe(false);
    // The refused teacher start used no device slot: learner starts fit up to their own cap.
    for (let i = 0; i < 5; i++) expect(demo.allow("learner", "a").ok).toBe(true);
  });

  it("says which cap refused the start and when it frees up", () => {
    const { demo, advance } = setup({ perDevice: 2, learnersSiteWide: 3, teachersSiteWide: 1 });
    demo.allow("learner", "a");
    advance(10 * 60_000);
    demo.allow("learner", "a");
    expect(demo.allow("learner", "a")).toEqual({
      ok: false,
      reason: "device",
      retryAfterMs: HOUR - 10 * 60_000,
    });
    demo.allow("learner", "b");
    expect(demo.allow("learner", "c")).toEqual({
      ok: false,
      reason: "site",
      retryAfterMs: HOUR - 10 * 60_000,
    });
  });

  it("waits for the later cap when both are full", () => {
    const { demo, advance } = setup({ perDevice: 2, learnersSiteWide: 2, teachersSiteWide: 5 });
    demo.allow("teacher", "a"); // t=0: browser "a" 1 of 2
    advance(20 * 60_000);
    demo.allow("learner", "a"); // t=20: browser "a" full; site learners 1 of 2
    advance(10 * 60_000);
    demo.allow("learner", "b"); // t=30: site learners full
    // Browser "a" frees up at t=60, the learner cap only at t=80: wait the full 50 minutes.
    expect(demo.allow("learner", "a")).toEqual({
      ok: false,
      reason: "device",
      retryAfterMs: 50 * 60_000,
    });
  });

  it("frees starts again after an hour", () => {
    const { demo, advance } = setup();
    for (let i = 0; i < 3; i++) demo.allow("learner", "a");
    expect(demo.allow("learner", "a").ok).toBe(false);
    advance(HOUR - 1);
    expect(demo.allow("learner", "a").ok).toBe(false);
    advance(2);
    expect(demo.allow("learner", "a").ok).toBe(true);
  });
});
