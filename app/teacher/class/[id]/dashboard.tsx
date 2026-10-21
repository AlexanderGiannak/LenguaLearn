"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { focusRing, muted } from "@/app/_components/ui";
import { loadLabels, type Labels } from "@/app/teacher/labels";
import type { teacherScope } from "@/lib/teacher/scope";

type Data = Awaited<ReturnType<ReturnType<typeof teacherScope>["dashboard"]>>;
type Row = Data["rows"][number];
type SortKey = "seat" | "minutes" | "flagged" | "accuracy" | "learned" | "lastActive" | "status";

const STATUS: Record<string, { label: string; className: string }> = {
  on_track: {
    label: "On track",
    className: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100",
  },
  behind: {
    label: "Behind",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  },
  not_started: {
    label: "Not started",
    className: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
  },
  flagged: {
    label: "Flagged",
    className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  },
};

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
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["On track", `${data.summary.onTrack} of ${data.summary.students}`],
            [
              "Median minutes",
              data.summary.medianMinutes === null ? "–" : `${data.summary.medianMinutes} / ${goal}`,
            ],
            ["Class accuracy", data.summary.accuracy === null ? "–" : `${data.summary.accuracy}%`],
            ["Weekly goal", `${goal} min`],
          ].map(([label, v]) => (
            <div key={label} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <dt className={`text-sm ${muted}`}>{label}</dt>
              <dd className="text-xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <label className="flex flex-col gap-1">
          <span className={`text-sm ${muted}`}>Week</span>
          <select
            defaultValue={0}
            onChange={(e) => void pickWeek(Number(e.target.value))}
            className={`min-h-11 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700 ${focusRing}`}
          >
            {Array.from({ length: 9 }, (_, i) => -i).map((o) => (
              <option key={o} value={o}>
                {o === 0 ? "This week" : o === -1 ? "Last week" : `${-o} weeks ago`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
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
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
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
                          className="h-2 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full bg-zinc-900 dark:bg-zinc-100"
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
                          className="underline"
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
                        className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-medium ${STATUS[r.status]!.className} ${focusRing}`}
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
