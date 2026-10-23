// Class weeks (spec: Class settings, "Week boundary"). A week runs from one reset moment to
// the next, at the class's chosen weekday and time in its own time zone. Built on Intl, so no
// time-zone library is needed.

export type WeekSettings = { resetDay: number; resetTime: string; timeZone: string };

const DAY_MS = 86_400_000;

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!),
  };
}

/** How far the zone is ahead of UTC at this instant, in ms. */
function offsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in a zone. Month is 1–12. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetMs(new Date(guess), timeZone);
  // Re-check once: the offset can differ on the other side of a daylight-saving change.
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** The week containing `now`, or `offset` weeks before or after it. */
export function weekWindow(now: Date, s: WeekSettings, offset = 0): { start: Date; end: Date } {
  const [hh, mm] = s.resetTime.split(":").map(Number) as [number, number];
  const local = parts(now, s.timeZone);
  // Walk back to the most recent reset weekday on or before today, in local dates.
  let back = (local.weekday - s.resetDay + 7) % 7;
  const candidate = (daysBack: number) => {
    const d = new Date(Date.UTC(local.year, local.month - 1, local.day - daysBack));
    return zonedTimeToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      hh,
      mm,
      s.timeZone,
    );
  };
  let start = candidate(back);
  if (start.getTime() > now.getTime()) start = candidate((back += 7));
  const shift = (base: number, weeks: number) => {
    const d = new Date(Date.UTC(local.year, local.month - 1, local.day - base + weeks * 7));
    return zonedTimeToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      hh,
      mm,
      s.timeZone,
    );
  };
  return { start: shift(back, offset), end: shift(back, offset + 1) };
}

/** The calendar day (YYYY-MM-DD) of an instant in a time zone. */
export function localDay(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / DAY_MS;
}

/**
 * The week as seven 24-hour slices from the reset moment, each named by the local day it
 * mostly covers (for minutes-per-day charts). The last slice ends at the week's end, so a
 * daylight-saving hour is never lost.
 */
export function weekDays(w: { start: Date; end: Date }, timeZone: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const start = new Date(w.start.getTime() + i * DAY_MS);
    const end = i === 6 ? w.end : new Date(w.start.getTime() + (i + 1) * DAY_MS);
    return { start, end, day: localDay(new Date(start.getTime() + DAY_MS / 2), timeZone) };
  });
}

/** The calendar date before a YYYY-MM-DD date. */
function dayBefore(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Days in a row with practice, ending today, or yesterday when today has none yet. Walks
 * local calendar dates, so a daylight-saving change never repeats or skips a day.
 */
export function streakDays(days: Set<string>, now: Date, timeZone: string): number {
  let day = localDay(now, timeZone);
  if (!days.has(day)) day = dayBefore(day);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = dayBefore(day);
  }
  return n;
}
