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
    expect(demo.allow("learner", "a")).toBe(true);
    expect(demo.allow("teacher", "a")).toBe(true);
    expect(demo.allow("learner", "a")).toBe(true);
    expect(demo.allow("learner", "a")).toBe(false);
    expect(demo.allow("teacher", "a")).toBe(false);
    // Another browser is unaffected.
    expect(demo.allow("learner", "b")).toBe(true);
  });

  it("caps each button site-wide, separately", () => {
    const { demo } = setup();
    expect(demo.allow("teacher", "a")).toBe(true);
    expect(demo.allow("teacher", "b")).toBe(true);
    expect(demo.allow("teacher", "c")).toBe(false);
    // The learner quota is separate.
    for (const d of ["c", "d", "e", "f", "g"]) expect(demo.allow("learner", d)).toBe(true);
    expect(demo.allow("learner", "h")).toBe(false);
  });

  it("does not count a refused start", () => {
    const { demo } = setup({ perDevice: 10, learnersSiteWide: 5, teachersSiteWide: 1 });
    expect(demo.allow("teacher", "a")).toBe(true);
    expect(demo.allow("teacher", "a")).toBe(false);
    // The refused teacher start used no device slot: learner starts fit up to their own cap.
    for (let i = 0; i < 5; i++) expect(demo.allow("learner", "a")).toBe(true);
  });

  it("frees starts again after an hour", () => {
    const { demo, advance } = setup();
    for (let i = 0; i < 3; i++) demo.allow("learner", "a");
    expect(demo.allow("learner", "a")).toBe(false);
    advance(HOUR - 1);
    expect(demo.allow("learner", "a")).toBe(false);
    advance(2);
    expect(demo.allow("learner", "a")).toBe(true);
  });
});
