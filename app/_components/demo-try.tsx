"use client";

import { useState } from "react";
import { Button, ErrorText, link, muted, postJson } from "./ui";

/** The demo site's one-click entry: a fresh learner, or a teacher with a ready class. */
export function DemoTry() {
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState<"learner" | "fresh" | "teacher" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(kind: "learner" | "fresh" | "teacher") {
    setBusy(kind);
    setError(null);
    const r = await postJson<{ next: string }>(
      "/api/demo/start",
      kind === "teacher"
        ? { role: kind }
        : { role: "learner", ageConfirmed: true, fresh: kind === "fresh" },
    );
    if (!r.ok) {
      setBusy(null);
      return setError(r.error);
    }
    window.location.assign(r.data.next);
  }

  return (
    <div className="card flex flex-col gap-4 p-6">
      <h2 className="text-xl font-extrabold">Try the demo</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className={muted}>
            Open a learner&apos;s home after three weeks of practice, then keep training.
          </p>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={age}
              onChange={(e) => setAge(e.target.checked)}
              className="h-5 w-5 accent-brand-600"
            />
            I am 13 or older.
          </label>
          <Button disabled={!age || busy !== null} onClick={() => start("learner")}>
            {busy === "learner" ? "Starting…" : "Try as a learner"}
          </Button>
          <button
            type="button"
            disabled={!age || busy !== null}
            onClick={() => start("fresh")}
            className={`${link} min-h-11 self-start disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50`}
          >
            {busy === "fresh" ? "Starting…" : "Or start fresh with the level check"}
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <p className={muted}>See a class of 25 students after four weeks of practice.</p>
          <Button
            variant="secondary"
            className="mt-auto"
            disabled={busy !== null}
            onClick={() => start("teacher")}
          >
            {busy === "teacher" ? "Setting up your class…" : "Try as a teacher"}
          </Button>
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
