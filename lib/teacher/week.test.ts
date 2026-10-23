import { describe, expect, it } from "vitest";
import { localDay, streakDays, weekDays, weekWindow, zonedTimeToUtc } from "./week";

const CHICAGO = "America/Chicago";
const sundayNight = { resetDay: 0, resetTime: "23:59", timeZone: CHICAGO };

describe("zonedTimeToUtc", () => {
  it("converts Chicago wall time in daylight time (UTC-5)", () => {
    expect(zonedTimeToUtc(2026, 10, 18, 23, 59, CHICAGO).toISOString()).toBe(
      "2026-10-19T04:59:00.000Z",
    );
  });
  it("and in standard time (UTC-6)", () => {
    expect(zonedTimeToUtc(2026, 11, 8, 23, 59, CHICAGO).toISOString()).toBe(
      "2026-11-09T05:59:00.000Z",
    );
  });
});

describe("weekWindow", () => {
  it("runs from the last reset to the next one (Sunday 11:59 pm, Chicago)", () => {
    // Wednesday 21 October 2026, noon Chicago time.
    const now = new Date("2026-10-21T17:00:00Z");
    const w = weekWindow(now, sundayNight);
    expect(w.start.toISOString()).toBe("2026-10-19T04:59:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-26T04:59:00.000Z");
  });

  it("counts the minute after the reset as the new week", () => {
    const w = weekWindow(new Date("2026-10-26T05:00:00Z"), sundayNight);
    expect(w.start.toISOString()).toBe("2026-10-26T04:59:00.000Z");
  });

  it("goes back whole weeks for the week picker", () => {
    const w = weekWindow(new Date("2026-10-21T17:00:00Z"), sundayNight, -1);
    expect(w.start.toISOString()).toBe("2026-10-12T04:59:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-19T04:59:00.000Z");
  });

  it("keeps the local reset time across the daylight-saving change", () => {
    // The week containing Sunday 1 November 2026, when Chicago falls back an hour.
    const w = weekWindow(new Date("2026-11-04T17:00:00Z"), sundayNight);
    expect(w.start.toISOString()).toBe("2026-11-02T05:59:00.000Z");
    const before = weekWindow(new Date("2026-10-28T17:00:00Z"), sundayNight);
    expect(before.end.toISOString()).toBe("2026-11-02T05:59:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(7 * 86_400_000);
    expect(before.end.getTime() - before.start.getTime()).toBe(7 * 86_400_000 + 3_600_000);
  });

  it("supports other reset days and zones", () => {
    const w = weekWindow(new Date("2026-10-21T17:00:00Z"), {
      resetDay: 5,
      resetTime: "15:00",
      timeZone: "America/New_York",
    });
    // Friday 16 October 2026, 3 pm New York = 19:00 UTC.
    expect(w.start.toISOString()).toBe("2026-10-16T19:00:00.000Z");
  });
});

describe("localDay", () => {
  it("gives the calendar day in the class time zone", () => {
    expect(localDay(new Date("2026-10-21T03:00:00Z"), CHICAGO)).toBe("2026-10-20");
    expect(localDay(new Date("2026-10-21T17:00:00Z"), CHICAGO)).toBe("2026-10-21");
  });
});

describe("weekDays", () => {
  it("splits a week into seven 24-hour slices named by their local day", () => {
    const w = weekWindow(new Date("2026-10-21T17:00:00Z"), sundayNight);
    const days = weekDays(w, CHICAGO);
    expect(days.map((d) => d.day)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(days[0]!.start).toEqual(w.start);
    expect(days[6]!.end).toEqual(w.end);
  });

  it("covers the whole week across the daylight-saving change", () => {
    // The week of 2 November 2026 ends an hour later in UTC than it starts.
    const w = weekWindow(new Date("2026-11-04T17:00:00Z"), sundayNight);
    const days = weekDays(w, CHICAGO);
    expect(days[6]!.end).toEqual(w.end);
    expect(days.map((d) => d.day)[0]).toBe("2026-11-02");
  });
});

describe("streakDays", () => {
  const now = new Date("2026-10-21T17:00:00Z"); // Wednesday, Chicago
  it("counts days in a row ending today", () => {
    const days = new Set(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-17"]);
    expect(streakDays(days, now, CHICAGO)).toBe(3);
  });
  it("keeps yesterday's streak alive until today is over", () => {
    expect(streakDays(new Set(["2026-10-19", "2026-10-20"]), now, CHICAGO)).toBe(2);
  });
  it("is zero after a missed day", () => {
    expect(streakDays(new Set(["2026-10-19"]), now, CHICAGO)).toBe(0);
    expect(streakDays(new Set(), now, CHICAGO)).toBe(0);
  });
});
