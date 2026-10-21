"use client";

import { useEffect, useState } from "react";
import { Button, ErrorText, focusRing, muted, postJson } from "@/app/_components/ui";
import { loadLabels, type Labels } from "@/app/teacher/labels";
import { suggestedGrade, type GradeFormula } from "@/lib/teacher/grades";
import type { teacherScope } from "@/lib/teacher/scope";

type GradeData = Awaited<ReturnType<ReturnType<typeof teacherScope>["gradeRows"]>>;
type Range = { kind: "week"; offset: number } | { kind: "dates"; from: string; to: string };

const input = `min-h-11 field ${focusRing}`;

function query(range: Range, f: GradeFormula, format: "json" | "csv") {
  const p = new URLSearchParams({
    format,
    gw: String(f.goalWeight),
    aw: String(f.accuracyWeight),
    fd: String(f.flaggedDeduction),
  });
  if (range.kind === "week") p.set("week", String(range.offset));
  else {
    p.set("from", range.from);
    p.set("to", range.to);
  }
  return p.toString();
}

export function Grades({ classId, initial }: { classId: string; initial: GradeData }) {
  const [data, setData] = useState(initial);
  const [formula, setFormula] = useState<GradeFormula>(initial.formula);
  const [range, setRange] = useState<Range>({ kind: "week", offset: 0 });
  const [labels, setLabels] = useState<Labels>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadLabels(classId);
    queueMicrotask(() => setLabels(stored));
  }, [classId]);

  async function load(r: Range) {
    setRange(r);
    if (r.kind === "dates" && (!r.from || !r.to)) return;
    const res = await fetch(`/api/teacher/classes/${classId}/grades?${query(r, formula, "json")}`);
    if (res.ok) setData((await res.json()) as GradeData);
  }

  async function saveFormula() {
    setError(null);
    const r = await postJson(
      `/api/teacher/classes/${classId}`,
      {
        gradeGoalWeight: formula.goalWeight,
        gradeAccuracyWeight: formula.accuracyWeight,
        gradeFlaggedDeduction: formula.flaggedDeduction,
      },
      "PATCH",
    );
    if (r.ok) setMessage("Saved as this class's formula.");
    else setError(r.error);
  }

  const setNum = (key: keyof GradeFormula) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormula((f) => ({ ...f, [key]: Math.max(0, Number(e.target.value) || 0) }));

  return (
    <section aria-label="Grades" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className={`text-sm ${muted}`}>Period</span>
          <select
            className={input}
            value={range.kind === "week" ? String(range.offset) : "dates"}
            onChange={(e) =>
              e.target.value === "dates"
                ? setRange({ kind: "dates", from: "", to: "" })
                : void load({ kind: "week", offset: Number(e.target.value) })
            }
          >
            <option value="0">This week</option>
            <option value="-1">Last week</option>
            <option value="-2">2 weeks ago</option>
            <option value="dates">Choose dates…</option>
          </select>
        </label>
        {range.kind === "dates" && (
          <>
            <label className="flex flex-col gap-1">
              <span className={`text-sm ${muted}`}>From</span>
              <input
                type="date"
                className={input}
                value={range.from}
                onChange={(e) => void load({ ...range, from: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={`text-sm ${muted}`}>To</span>
              <input
                type="date"
                className={input}
                value={range.to}
                onChange={(e) => void load({ ...range, to: e.target.value })}
              />
            </label>
          </>
        )}
      </div>

      <fieldset className="flex flex-wrap items-end gap-4 card p-4">
        <legend className="px-1 font-semibold">Grade formula</legend>
        <label className="flex flex-col gap-1">
          <span className={`text-sm ${muted}`}>Weight on % of goal (capped at 100%)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            className={input}
            value={formula.goalWeight}
            onChange={setNum("goalWeight")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`text-sm ${muted}`}>Weight on accuracy</span>
          <input
            type="number"
            min={0}
            step={0.1}
            className={input}
            value={formula.accuracyWeight}
            onChange={setNum("accuracyWeight")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={`text-sm ${muted}`}>Points off per flagged minute</span>
          <input
            type="number"
            min={0}
            step={0.5}
            className={input}
            value={formula.flaggedDeduction}
            onChange={setNum("flaggedDeduction")}
          />
        </label>
        <Button variant="secondary" onClick={saveFormula}>
          Save formula
        </Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      <ErrorText>{error}</ErrorText>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <caption className={`mb-2 text-left text-sm ${muted}`}>
            Preview. Goal for this period: {data.goalMinutes} minutes.
          </caption>
          <thead className={`text-sm ${muted}`}>
            <tr>
              <th className="py-2 pr-3">Seat</th>
              <th className="py-2 pr-3">Minutes</th>
              <th className="py-2 pr-3">% of goal</th>
              <th className="py-2 pr-3">Accuracy</th>
              <th className="py-2 pr-3">Flagged min</th>
              <th className="py-2">Suggested grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {data.rows.map((r) => (
              <tr key={r.seatId}>
                <td className="py-2 pr-3">
                  {r.seat} <span className={muted}>{labels[r.seatId] ?? r.handle}</span>
                </td>
                <td className="py-2 pr-3">{r.minutes}</td>
                <td className="py-2 pr-3">{r.percentOfGoal}%</td>
                <td className="py-2 pr-3">{r.accuracy === null ? "–" : `${r.accuracy}%`}</td>
                <td className="py-2 pr-3">{r.flaggedMinutes}</td>
                <td className="py-2 font-semibold">
                  {suggestedGrade(
                    {
                      minutes: r.minutes,
                      goalMinutes: r.goal,
                      accuracy: r.accuracy,
                      flaggedMinutes: r.flaggedMinutes,
                    },
                    formula,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <a
        href={`/api/teacher/classes/${classId}/grades?${query(range, formula, "csv")}`}
        className={`btn btn-primary self-start ${focusRing}`}
      >
        Download grades (CSV)
      </a>
      <p className={`text-sm ${muted}`}>
        The CSV lists seats and handles only. Match them to names in your own gradebook.
      </p>
    </section>
  );
}
