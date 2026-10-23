"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChartCard, ColumnChart, DotStrip, StackedBar, StatTile } from "@/app/_components/charts";
import { focusRing, muted } from "@/app/_components/ui";
import { loadLabels, type Labels } from "@/app/teacher/labels";
import type { teacherScope } from "@/lib/teacher/scope";

type Data = Awaited<ReturnType<ReturnType<typeof teacherScope>["dashboard"]>>;
type Row = Data["rows"][number];
type SortKey = "seat" | "minutes" | "flagged" | "accuracy" | "learned" | "lastActive" | "status";

// Status colors mean only these states, and always come with their label.
const STATUS: Record<string, { label: string; className: string; color: string }> = {
  on_track: {
    label: "On track",
    color: "var(--status-good)",
    className: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
  },
  behind: {
    label: "Behind",
    color: "var(--status-warning)",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  not_started: {
    label: "Not started",
    color: "var(--status-none)",
    className: "bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100",
  },
  flagged: {
    label: "Flagged",
    color: "var(--status-critical)",
    className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  },
};

const STATUS_ORDER = ["on_track", "behind", "flagged", "not_started"];

const weekday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
/** Today's date in the class's time zone, as YYYY-MM-DD. */
const today = (timeZone: string) => new Date().toLocaleDateString("en-CA", { timeZone });
function span(start: string, end: string) {
  const f = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(start)} – ${f(new Date(new Date(end).getTime() - 60_000).toISOString())}`;
}

function relative(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function value(r: Row, key: SortKey): number | string {
  if (!r.joined) return key === "seat" ? r.seatNumber : -1;
  switch (key) {
    case "seat":
      return r.seatNumber;
    case "minutes":
      return r.minutes;
    case "flagged":
      return r.flaggedMinutes;
    case "accuracy":
      return r.accuracy ?? -1;
    case "learned":
      return r.learned;
    case "lastActive":
      return r.lastActive ?? "";
    case "status":
      return r.status;
  }
}

export function Dashboard({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [labels, setLabels] = useState<Labels>({});
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "seat", desc: false });

  useEffect(() => {
    const stored = loadLabels(initial.class.id);
    queueMicrotask(() => setLabels(stored));
  }, [initial.class.id]);

  async function pickWeek(offset: number) {
    const res = await fetch(`/api/teacher/classes/${initial.class.id}/dashboard?week=${offset}`);
    if (res.ok) setData((await res.json()) as Data);
  }

  const rows = useMemo(() => {
    const sorted = [...data.rows].sort((a, b) => {
      const x = value(a, sort.key);
      const y = value(b, sort.key);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return sort.desc ? sorted.reverse() : sorted;
  }, [data.rows, sort]);

  const goal = data.class.weeklyGoalMinutes;
  const joined = data.rows.filter((r) => r.joined);
  const gained = joined.reduce((n, r) => n + r.gained, 0);
  const header = (key: SortKey, label: string) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}
      className="py-2 pr-3"
    >
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "seat" }))}
        className={`min-h-11 text-left font-medium ${focusRing}`}
      >
        {label}
        {sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <section aria-label="Dashboard" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className={muted}>
          {span(data.week.start, data.week.end)} · goal {goal} minutes
        </p>
        <label className="flex flex-col gap-1">
          <span className={`text-sm ${muted}`}>Week</span>
          <select
            defaultValue={0}
            onChange={(e) => void pickWeek(Number(e.target.value))}
            className={`min-h-11 field ${focusRing}`}
          >
            {Array.from({ length: 9 }, (_, i) => -i).map((o) => (
              <option key={o} value={o}>
                {o === 0 ? "This week" : o === -1 ? "Last week" : `${-o} weeks ago`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="On track"
          value={`${data.summary.onTrack} of ${data.summary.students}`}
          note="Keeping pace with the goal"
        />
        <StatTile
          label="Median minutes"
          value={data.summary.medianMinutes === null ? "–" : data.summary.medianMinutes}
          note={`Goal ${goal} min`}
        />
        <StatTile
          label="Class accuracy"
          value={data.summary.accuracy === null ? "–" : `${data.summary.accuracy}%`}
          note="Right on the first try"
        />
        <StatTile label="Words learned" value={gained} note="New this week, whole class" />
      </dl>

      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Minutes by student"
          subtitle="Each dot is one student; hover for the seat"
        >
          <StackedBar
            label="Students by status"
            segments={STATUS_ORDER.map((k) => ({
              key: k,
              label: STATUS[k]!.label,
              value: joined.filter((r) => r.status === k).length,
              color: STATUS[k]!.color,
            }))}
          />
          <DotStrip
            label="Minutes this week, one dot per student"
            unit=" min"
            goal={{ value: goal, label: `Goal ${goal}` }}
            dots={joined.map((r) => ({
              key: r.seatId,
              value: r.minutes,
              color: STATUS[r.status]!.color,
              title: `Seat ${r.seatNumber} ${labels[r.seatId] ?? r.handle} · ${STATUS[r.status]!.label}`,
            }))}
          />
        </ChartCard>
        <ChartCard
          className="lg:col-span-2"
          title="Class minutes per day"
          subtitle="All students together"
        >
          <ColumnChart
            label="Class minutes per day"
            unit=" min"
            emphasis={data.week.offset === 0 ? today(data.class.timeZone) : undefined}
            data={data.byDay.map((d) => ({
              key: d.day,
              label: weekday(d.day),
              value: d.minutes,
              detail: longDay(d.day),
            }))}
          />
        </ChartCard>
      </div>

      <div className="overflow-x-auto">
        <table aria-label="Students" className="w-full min-w-[720px] text-left">
          <thead className={`text-sm ${muted}`}>
            <tr>
              {header("seat", "Seat")}
              {header("minutes", "Minutes this week")}
              {header("flagged", "Flagged")}
              {header("accuracy", "Accuracy")}
              {header("learned", "Words learned")}
              {header("lastActive", "Last active")}
              {header("status", "Status")}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {rows.map((r) => (
              <tr key={r.seatId}>
                <td className="py-2 pr-3">
                  <span className="font-medium">{r.seatNumber}</span>{" "}
                  <span className={muted}>
                    {labels[r.seatId] ?? (r.joined ? r.handle : "not joined")}
                  </span>
                </td>
                {r.joined ? (
                  <>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-24 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full bg-brand-500"
                            style={{ width: `${Math.min(100, (100 * r.minutes) / goal)}%` }}
                          />
                        </div>
                        <span>
                          {r.minutes} / {goal}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {r.flaggedMinutes > 0 ? (
                        <Link
                          className={`inline-flex min-h-11 min-w-11 items-center underline ${focusRing}`}
                          href={`/teacher/class/${data.class.id}/student/${r.seatId}`}
                        >
                          {r.flaggedMinutes}
                        </Link>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="py-2 pr-3">{r.accuracy === null ? "–" : `${r.accuracy}%`}</td>
                    <td className="py-2 pr-3">
                      {r.learned}
                      {r.gained > 0 && <span className={muted}> (+{r.gained})</span>}
                    </td>
                    <td className="py-2 pr-3">{relative(r.lastActive)}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={`/teacher/class/${data.class.id}/student/${r.seatId}`}
                        className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${STATUS[r.status]!.className} ${focusRing}`}
                      >
                        {STATUS[r.status]!.label}
                      </Link>
                    </td>
                  </>
                ) : (
                  <td colSpan={6} className={`py-2 ${muted}`}>
                    Code not redeemed yet
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-sm ${muted}`}>
        Minutes count only attentive practice; flagged minutes are shown separately. Words learned:
        passed a review after a gap of at least 7 days, with predicted recall of at least 85%.
      </p>
    </section>
  );
}
