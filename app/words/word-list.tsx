"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { focusRing, muted } from "@/app/_components/ui";

type Word = {
  senseId: number;
  display: string;
  gloss: string;
  state: "new" | "learning" | "learned" | "due";
  recognition: number;
  production: number;
};

const CHIP: Record<Word["state"], [string, string]> = {
  new: ["New", "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100"],
  learning: ["Learning", "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"],
  learned: ["Learned", "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100"],
  due: ["Due", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"],
};

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className={`w-20 ${muted}`}>{label}</span>
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 w-20 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <span
          className="block h-full bg-zinc-900 dark:bg-zinc-100"
          style={{ width: `${value}%` }}
        />
      </span>
    </span>
  );
}

export function WordList({ words }: { words: Word[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("es");
    return needle
      ? words.filter(
          (w) =>
            w.display.toLocaleLowerCase("es").includes(needle) ||
            w.gloss.toLowerCase().includes(needle),
        )
      : words;
  }, [q, words]);

  if (words.length === 0) return <p className={muted}>No words yet. Start training to add some.</p>;
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Search</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={`min-h-11 rounded-lg border border-zinc-300 bg-transparent px-3 dark:border-zinc-700 ${focusRing}`}
        />
      </label>
      <p className={`text-sm ${muted}`}>
        {shown.length} of {words.length} words. Opening a word shows its page without affecting your
        reviews.
      </p>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {shown.map((w) => (
          <li key={w.senseId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link
              href={`/word/${w.senseId}`}
              className={`flex min-h-11 flex-col justify-center ${focusRing}`}
            >
              <span lang="es" className="font-medium">
                {w.display}
              </span>
              <span className={`text-sm ${muted}`}>{w.gloss}</span>
            </Link>
            <span className="flex flex-wrap items-center gap-4">
              <Meter label="Recognize" value={w.recognition} />
              <Meter label="Produce" value={w.production} />
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${CHIP[w.state][1]}`}>
                {CHIP[w.state][0]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
