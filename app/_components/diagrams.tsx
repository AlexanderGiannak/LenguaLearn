import type { ReactNode } from "react";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { INTEGRITY_CONFIG } from "@/lib/integrity/config";
import { muted } from "./styles";
import { TONES, type Tone } from "./tones";

// Static diagrams for the public pages: how a session, the question ladder, answer checking,
// pacing and counted minutes work. Numbers come from the engine and integrity configs, so
// the pictures change with them. No Spanish: example words would be content, not code.

const C = ENGINE_CONFIG;

function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`h-4 w-4 shrink-0 ${className}`}>
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A new word through one session: the page, a quick check, and the second check later. */
export function SessionStrip() {
  const [lo, hi] = C.session.secondCheckAfterItems;
  const n = 10;
  const second = Math.round((lo + hi) / 2);
  const kinds = Array.from({ length: n }, (_, i) =>
    i === 0 ? "page" : i === 1 || i === second ? "check" : "other",
  );
  const center = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const style = {
    page: "bg-brand-500 text-white dark:bg-brand-400 dark:text-brand-950",
    check: "bg-teal-600 text-white dark:bg-teal-400 dark:text-teal-950",
    other: "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500",
  };
  return (
    <div>
      <div
        role="img"
        aria-label={`A session as a row of questions: the new word's page, a quick question right after it, other reviews, and a second check ${lo} to ${hi} questions after the page.`}
      >
        <div className="relative mb-2 h-9">
          <div
            className="absolute top-5 h-3 rounded-t-md border-x-2 border-t-2 border-teal-500"
            style={{ left: center(0), right: `calc(100% - ${center(second)})` }}
          />
          <span
            className="absolute top-0 -translate-x-1/2 rounded-full bg-teal-50 px-2 text-xs font-bold whitespace-nowrap text-teal-800 dark:bg-teal-950 dark:text-teal-200"
            style={{ left: `calc((${center(0)} + ${center(second)}) / 2)` }}
          >
            {lo}–{hi} questions later
          </span>
        </div>
        <ol
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {kinds.map((k, i) => (
            <li
              key={i}
              className={`flex aspect-[3/4] items-center justify-center rounded-lg ${style[k as keyof typeof style]}`}
            >
              {k === "page" ? (
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
                  <rect
                    x="3"
                    y="2"
                    width="10"
                    height="12"
                    rx="2"
                    fill="currentColor"
                    opacity=".35"
                  />
                  <path
                    d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : k === "check" ? (
                <Check />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </li>
          ))}
        </ol>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {(
          [
            ["bg-brand-500 dark:bg-brand-400", "The new word's page"],
            ["bg-teal-600 dark:bg-teal-400", "A question on the new word"],
            ["bg-ink-200 dark:bg-ink-700", "Reviews of other words"],
          ] as const
        ).map(([c, l]) => (
          <li key={l} className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-3 w-3 rounded-[3px] ${c}`} />
            <span className={muted}>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Three rungs of question types, by how strong the tested memory is. */
export function QuestionLadder() {
  const { lowDays, highDays } = C.bands;
  const rungs: { tone: Tone; name: string; when: string; does: string; h: string }[] = [
    {
      tone: "sky",
      name: "Recognize",
      when: `Under ${lowDays} days`,
      does: "Pick the meaning",
      h: "min-h-36 sm:min-h-28",
    },
    {
      tone: "violet",
      name: "Choose",
      when: `${lowDays} to ${highDays} days`,
      does: "Pick the Spanish word",
      h: "min-h-44 sm:min-h-36",
    },
    {
      tone: "coral",
      name: "Produce",
      when: `Over ${highDays} days`,
      does: "Type it from memory",
      h: "min-h-52 sm:min-h-44",
    },
  ];
  return (
    <div>
      <ol className="grid grid-cols-3 items-end gap-1.5 sm:gap-3">
        {rungs.map((r, i) => (
          <li
            key={r.name}
            className={`flex ${r.h} min-w-0 flex-col justify-between gap-2 rounded-2xl border-2 p-2.5 sm:p-4 ${TONES[r.tone].soft}`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${TONES[r.tone].badge}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className={`text-[13px] font-extrabold sm:text-lg ${TONES[r.tone].ink}`}>
                {r.name}
              </span>
              <span className="text-xs font-semibold sm:text-sm">{r.does}</span>
              <span className={`text-xs ${muted}`}>{r.when}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className={`mt-3 flex items-center gap-2 text-sm ${muted}`}>
        <span aria-hidden="true">→</span> How long the word is likely to stick (its memory
        stability)
      </p>
    </div>
  );
}

type Verdict = "right" | "almost" | "wrong";
const VERDICT: Record<Verdict, { label: string; className: string }> = {
  right: {
    label: "Right",
    className: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  },
  almost: {
    label: "Almost",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  wrong: { label: "Wrong", className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
};

function Chip({ v, note }: { v: Verdict; note?: string }) {
  return (
    <span
      className={`inline-flex flex-col rounded-lg px-2 py-1 text-xs font-bold sm:text-sm ${VERDICT[v].className}`}
    >
      {VERDICT[v].label}
      {note && <span className="text-[11px] font-medium opacity-80">{note}</span>}
    </span>
  );
}

/** How typed answers are judged, by how well the word is known. */
export function AnswerRules() {
  const rows: { what: string; cells: [Verdict, Verdict, Verdict]; note?: string }[] = [
    { what: "Capitals, extra spaces, no article", cells: ["right", "right", "right"] },
    {
      what: "A missing accent",
      cells: ["right", "almost", "wrong"],
      note: "if it makes another word",
    },
    {
      what: `One typo (${C.answerCheck.typoMinLength}+ letters)`,
      cells: ["almost", "almost", "almost"],
    },
    { what: "A missing ñ", cells: ["wrong", "wrong", "wrong"] },
  ];
  return (
    <div>
      <table className="w-full table-fixed border-separate border-spacing-y-2 text-left text-xs sm:text-sm">
        <caption className="sr-only">How typed answers are checked as a word gets stronger</caption>
        <thead>
          <tr className={muted}>
            <th className="w-[34%] pr-2 font-semibold">You type…</th>
            <th className="px-1 font-semibold">New word</th>
            <th className="px-1 font-semibold">Stable {C.answerCheck.accentHardFromDays}+ days</th>
            <th className="px-1 font-semibold">Learned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.what}>
              <th className="pr-2 font-semibold">{r.what}</th>
              {r.cells.map((v, i) => (
                <td key={i} className="px-1">
                  <Chip v={v} note={i === 2 ? r.note : undefined} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Meter({ filled, total, tone }: { filled: number; total: number; tone: string }) {
  return (
    <span aria-hidden="true" className="flex flex-wrap gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${i < filled ? tone : "bg-ink-200 dark:bg-ink-700"}`}
        />
      ))}
    </span>
  );
}

/** The three conditions for a new word, with one example session that passes them all. */
export function PacingGates() {
  const g = C.newWordGate;
  const gates: { title: string; rule: string; example: ReactNode; text: string }[] = [
    {
      title: "Keeping up",
      rule: `At least ${Math.round(g.minRecentAccuracy * 100)}% of the last ${g.recentAnswers} answers right`,
      example: <Meter filled={8} total={g.recentAnswers} tone="bg-teal-500" />,
      text: `8 of ${g.recentAnswers} right`,
    },
    {
      title: "Reviews in hand",
      rule: `Fewer than ${g.maxOverdue} reviews overdue`,
      example: <Meter filled={6} total={g.maxOverdue} tone="bg-sky-500" />,
      text: "6 overdue",
    },
    {
      title: "Room for more",
      rule: `Fewer than ${g.maxNewPerSession} new words this session`,
      example: <Meter filled={3} total={g.maxNewPerSession} tone="bg-brand-500" />,
      text: "3 new so far",
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-3 sm:grid-cols-3">
        {gates.map((x) => (
          <li
            key={x.title}
            className="flex flex-col gap-2 rounded-2xl border-2 border-ink-100 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-extrabold">{x.title}</span>
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-900 dark:bg-green-950 dark:text-green-200">
                <Check className="h-3 w-3" /> Open
              </span>
            </span>
            <span className={`text-sm ${muted}`}>{x.rule}</span>
            {x.example}
            <span className="text-xs font-semibold">Example: {x.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-semibold">
        All three open: the next item can be a new word. Any one closed: reviews first.
      </p>
    </div>
  );
}

/** One example session's minutes: what counts, what pauses, what is flagged. */
export function MinutesBar() {
  const idle = INTEGRITY_CONFIG.idlePauseMs / 60_000;
  const parts: { min: number; kind: "counted" | "paused" | "flagged" }[] = [
    { min: 4, kind: "counted" },
    { min: 2, kind: "paused" },
    { min: 4.5, kind: "counted" },
    { min: 1.5, kind: "flagged" },
    { min: 3, kind: "counted" },
  ];
  const total = parts.reduce((n, p) => n + p.min, 0);
  const counted = parts.filter((p) => p.kind === "counted").reduce((n, p) => n + p.min, 0);
  const flagged = parts.filter((p) => p.kind === "flagged").reduce((n, p) => n + p.min, 0);
  const look = {
    counted: { label: "Counted", className: "bg-brand-500 dark:bg-brand-400" },
    paused: {
      label: `Paused after ${idle} minutes without input, not counted`,
      className:
        "bg-ink-200 dark:bg-ink-700 bg-[repeating-linear-gradient(135deg,transparent_0_5px,rgb(0_0_0/0.08)_5px_8px)]",
    },
    flagged: {
      label: "Flagged: shown to the teacher separately",
      className:
        "bg-[var(--status-critical)] bg-[repeating-linear-gradient(45deg,transparent_0_5px,rgb(255_255_255/0.35)_5px_8px)]",
    },
  };
  return (
    <div>
      <div
        role="img"
        aria-label={`An example session of ${total} minutes: ${counted} counted, ${flagged} flagged, the rest paused.`}
        className="flex h-8 w-full gap-[2px] overflow-hidden rounded-lg"
      >
        {parts.map((p, i) => (
          <div
            key={i}
            className={look[p.kind].className}
            style={{ width: `${(100 * p.min) / total}%` }}
          />
        ))}
      </div>
      <div
        className={`mt-1 flex justify-between text-[11px] tabular-nums ${muted}`}
        aria-hidden="true"
      >
        <span>0 min</span>
        <span>{total} min</span>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
        {(["counted", "paused", "flagged"] as const).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-3 w-5 shrink-0 rounded-[3px] ${look[k].className}`}
            />
            <span className={muted}>{look[k].label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm font-semibold">
        This session: {counted} minutes count toward the goal, {flagged} flagged.
      </p>
    </div>
  );
}

/** The status flow every word goes through before a student sees it. */
export function ContentFlow() {
  const steps: { tone: Tone; title: string; text: string }[] = [
    { tone: "sky", title: "Draft", text: "An AI model writes the page" },
    { tone: "violet", title: "AI check", text: "A second AI checks every field" },
    { tone: "coral", title: "Human review", text: "A person fixes and approves it" },
    { tone: "teal", title: "Live", text: "Only now can students see it" },
  ];
  return (
    <ol className="grid gap-2 sm:grid-cols-4 sm:gap-0">
      {steps.map((s, i) => (
        <li key={s.title} className="flex items-stretch gap-2 sm:flex-col sm:gap-0">
          <div className="flex items-center sm:flex-row">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${TONES[s.tone].badge}`}
            >
              {i === steps.length - 1 ? <Check /> : i + 1}
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="mx-2 hidden h-0.5 flex-1 bg-ink-200 sm:block dark:bg-ink-700"
              />
            )}
          </div>
          <div className="flex flex-col pb-1 sm:pt-2 sm:pr-3">
            <span className={`font-extrabold ${TONES[s.tone].ink}`}>{s.title}</span>
            <span className={`text-sm ${muted}`}>{s.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
