"use client";

import { useState } from "react";
import { Button, ErrorText, Field, focusRing, muted, postJson } from "@/app/_components/ui";

type Settings = {
  name: string;
  weeklyGoalMinutes: number;
  weekResetDay: number;
  weekResetTime: string;
  timeZone: string;
  sessionMinutes: number;
  focusListId: number | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];
const select = `min-h-11 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700 ${focusRing}`;

export function ClassSettings({
  classId,
  initial,
  lists,
  students,
}: {
  classId: string;
  initial: Settings;
  lists: { id: number; name: string }[];
  students: { seatId: string; seatNumber: number; handle: string | null; startLevel: number }[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(form: FormData) {
    setError(null);
    setMessage(null);
    const focus = String(form.get("focusListId"));
    const r = await postJson(
      `/api/teacher/classes/${classId}`,
      {
        name: String(form.get("name")),
        weeklyGoalMinutes: Number(form.get("weeklyGoalMinutes")),
        weekResetDay: Number(form.get("weekResetDay")),
        weekResetTime: String(form.get("weekResetTime")),
        timeZone: String(form.get("timeZone")),
        sessionMinutes: Number(form.get("sessionMinutes")),
        focusListId: focus ? Number(focus) : null,
      },
      "PATCH",
    );
    if (r.ok) setMessage("Saved.");
    else setError(r.error);
  }

  async function setLevel(seatId: string, level: number) {
    const r = await postJson(`/api/teacher/seats/${seatId}/level`, { level });
    setMessage(r.ok ? "Starting level saved." : null);
    if (!r.ok) setError(r.error);
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={save} className="flex flex-col gap-4">
        <Field label="Class name" name="name" defaultValue={initial.name} required maxLength={80} />
        <Field
          label="Weekly goal (minutes)"
          name="weeklyGoalMinutes"
          type="number"
          min={1}
          max={10000}
          defaultValue={initial.weeklyGoalMinutes}
          required
        />
        <Field
          label="Session length (minutes)"
          name="sessionMinutes"
          type="number"
          min={1}
          max={60}
          defaultValue={initial.sessionMinutes}
          required
        />
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Week resets on</span>
            <select name="weekResetDay" defaultValue={initial.weekResetDay} className={select}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">at</span>
            <input
              type="time"
              name="weekResetTime"
              defaultValue={initial.weekResetTime}
              className={select}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium">Time zone</span>
            <select name="timeZone" defaultValue={initial.timeZone} className={select}>
              {(ZONES.includes(initial.timeZone) ? ZONES : [initial.timeZone, ...ZONES]).map(
                (z) => (
                  <option key={z} value={z}>
                    {z.replace("_", " ")}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Focus list</span>
          <select name="focusListId" defaultValue={initial.focusListId ?? ""} className={select}>
            <option value="">None: words in frequency order</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <span className={`text-sm ${muted}`}>
            Words from the focus list are introduced first.
          </span>
        </label>
        <Button type="submit">Save settings</Button>
      </form>
      {message && <p role="status">{message}</p>}
      <ErrorText>{error}</ErrorText>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Starting levels</h2>
        <p className={muted}>
          A student&apos;s new words start at this level. Placement sets it when they take the test.
        </p>
        {students.length === 0 ? (
          <p className={muted}>No students have joined yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {students.map((s) => (
              <li key={s.seatId} className="flex items-center justify-between gap-4 py-2">
                <span>
                  Seat {s.seatNumber} <span className={`font-mono ${muted}`}>{s.handle}</span>
                </span>
                <label className="flex items-center gap-2">
                  <span className="text-sm">Level</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={s.startLevel}
                    className={`${select} w-24`}
                    onBlur={(e) => {
                      const level = Number(e.target.value);
                      if (level >= 1 && level !== s.startLevel) void setLevel(s.seatId, level);
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
