import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/lib/db/client";
import { seedFixtureContent } from "@/test/seed-content";
import { seedDemoClass } from "./demo";
import { teacherScope } from "./scope";
import { weekWindow } from "./week";

// Spec, Phase 5 "done when": run a fake class of 25 seeded students through a simulated
// week and export grades.

let demo: Awaited<ReturnType<typeof seedDemoClass>>;
let teacherId: string;
const NOW = new Date("2026-10-23T22:00:00Z"); // Friday afternoon in Chicago

beforeAll(async () => {
  await seedFixtureContent();
  demo = await seedDemoClass({ students: 25, days: 7, minutesPerSession: 2, now: NOW, seed: 7 });
  const [row] = await getSql()`select teacher_id from classroom where id = ${demo.classId}`;
  teacherId = row!.teacher_id as string;
}, 300_000);

afterAll(async () => {
  await getSql().end();
});

describe("a simulated week for a class of 25", () => {
  it("fills the dashboard with a row per seat and a class summary", async () => {
    const d = await teacherScope(teacherId).dashboard(demo.classId, 0, NOW);
    expect(d.rows).toHaveLength(25);
    expect(d.summary.students).toBe(25);
    const joined = d.rows.filter((r) => r.joined);
    const statuses = new Set(joined.map((r) => (r.joined ? r.status : null)));
    expect(statuses.has("not_started")).toBe(true);
    expect(statuses.has("on_track") || statuses.has("behind")).toBe(true);
    const active = joined.filter((r) => r.joined && r.minutes > 0);
    expect(active.length).toBeGreaterThan(15);
    for (const r of active) {
      if (!r.joined) continue;
      expect(r.accuracy).not.toBeNull();
      expect(r.lastActive).not.toBeNull();
    }
    expect(d.summary.medianMinutes).toBeGreaterThan(0);
  });

  it("exports grades for the week", async () => {
    const c = await teacherScope(teacherId).getClass(demo.classId);
    const week = weekWindow(NOW, {
      resetDay: c.weekResetDay,
      resetTime: c.weekResetTime,
      timeZone: c.timeZone,
    });
    const g = await teacherScope(teacherId).gradeRows(demo.classId, week);
    expect(g.rows).toHaveLength(25);
    expect(g.goalMinutes).toBe(45);
    for (const r of g.rows) {
      expect(r.suggestedGrade).toBeGreaterThanOrEqual(0);
      expect(r.suggestedGrade).toBeLessThanOrEqual(100);
      // Default formula: the grade is percent of goal, capped at 100.
      expect(r.suggestedGrade).toBe(Math.min(100, Math.round((100 * r.minutes) / r.goal)));
    }
    expect(g.rows.some((r) => r.minutes > 0)).toBe(true);
    expect(g.rows.some((r) => r.minutes === 0)).toBe(true);
  });

  it("shows each student's detail and the class's most-missed words", async () => {
    const scope = teacherScope(teacherId);
    const d = await scope.dashboard(demo.classId, 0, NOW);
    const busiest = d.rows
      .filter((r) => r.joined)
      .sort((a, b) => (b.joined && a.joined ? b.minutes - a.minutes : 0))[0]!;
    const detail = await scope.studentDetail(demo.classId, busiest.seatId, NOW);
    expect(detail.minutesPerDay).toHaveLength(28);
    expect(detail.minutesPerDay.some((m) => m.minutes > 0)).toBe(true);
    expect(detail.inProgress + detail.learned).toBeGreaterThan(0);
    const insights = await scope.insights(demo.classId, NOW);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(15);
    expect(insights[0]!.missed).toBeGreaterThan(0);
  });

  it("keeps it all inside the teacher's own scope", async () => {
    const other = teacherScope("someone-else");
    await expect(other.dashboard(demo.classId)).rejects.toThrow("not found");
    await expect(other.gradeRows(demo.classId, { start: new Date(0), end: NOW })).rejects.toThrow(
      "not found",
    );
    await expect(other.insights(demo.classId)).rejects.toThrow("not found");
  });
});
