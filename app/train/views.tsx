"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AudioButton, playAudio } from "@/app/_components/audio-button";
import { getAutoplay } from "@/app/_components/preferences";
import type { WordCore } from "@/lib/train/content";
import type { NotePart } from "@/lib/engine/answer-check";
import type { Feedback, PublicQuestion, SessionSummary } from "@/lib/train/types";

// The screens of a training session. Every action works by keyboard (1–4 pick, 0 is
// "I don't know", Enter continues, Space plays audio) and by touch.

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const muted = "text-ink-600 dark:text-ink-400";
const primaryButton = `btn btn-primary min-h-12 px-6 text-lg ${focusRing}`;
const secondaryButton = `btn btn-secondary min-h-12 px-6 text-lg ${focusRing}`;
/** A small keyboard-shortcut badge. */
const keyBadge =
  "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg border-2 border-current px-1.5 text-sm font-bold opacity-60";

/** A feedback line with its Spanish words marked lang="es" for screen readers. */
function Parts({ parts }: { parts: NotePart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.lang ? (
          <span key={i} lang={p.lang}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Runs `handler` for keydowns, except plain typing inside text inputs. */
function useKeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const typing = e.target instanceof HTMLInputElement;
      if (typing && e.key !== "Enter") return;
      ref.current(e);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

function Sentence({
  text,
  start,
  end,
  gap,
}: {
  text: string;
  start: number;
  end: number;
  gap?: boolean;
}) {
  return (
    <span lang="es">
      {text.slice(0, start)}
      {gap ? (
        <span
          aria-label="blank"
          className="mx-1 inline-block w-20 border-b-2 border-current align-baseline"
        />
      ) : (
        <mark className="rounded bg-amber-100 px-0.5 font-semibold text-inherit dark:bg-amber-500/25">
          {text.slice(start, end)}
        </mark>
      )}
      {text.slice(end)}
    </span>
  );
}

/** The core of a word page: headword, meaning, one example. */
export function WordCard({ word }: { word: WordCore }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p lang="es" className="text-4xl font-semibold tracking-tight break-words">
          {word.display}
        </p>
        <AudioButton
          src={word.lemmaAudioUrl}
          text={word.display}
          label={`Play ${word.headword}`}
          size="lg"
        />
      </div>
      <div>
        <p className="text-2xl font-medium">{word.gloss}</p>
        <p className={`mt-1 text-lg ${muted}`}>{word.definition}</p>
      </div>
      {word.example && (
        <div className="flex items-start gap-3">
          <AudioButton
            src={word.example.audioUrl}
            text={word.example.text}
            label="Play the example sentence"
          />
          <div>
            <p className="text-lg">
              <Sentence
                text={word.example.text}
                start={word.example.start}
                end={word.example.end}
              />
            </p>
            <p className={muted}>{word.example.translation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function IntroView({
  word,
  onChoose,
  busy,
}: {
  word: WordCore & { partOfSpeech: string };
  onChoose: (choice: "got_it" | "already_know") => void;
  busy: boolean;
}) {
  // Settings: optional autoplay of each new word's audio.
  useEffect(() => {
    if (getAutoplay()) playAudio(word.lemmaAudioUrl, word.display);
  }, [word.lemmaAudioUrl, word.display]);

  useKeys((e) => {
    if (busy) return;
    if (e.key === "1" || e.key === "Enter") onChoose("got_it");
    if (e.key === "2") onChoose("already_know");
    if (e.key === " ") {
      e.preventDefault();
      playAudio(word.lemmaAudioUrl, word.display);
    }
  });
  return (
    <section aria-label="New word" className="flex flex-col gap-8">
      <p className="self-start rounded-full bg-brand-100 px-3 py-1 text-sm font-bold tracking-wide text-brand-800 uppercase dark:bg-brand-950 dark:text-brand-200">
        New word · {word.partOfSpeech}
      </p>
      <WordCard word={word} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className={primaryButton}
          disabled={busy}
          onClick={() => onChoose("got_it")}
        >
          Got it <kbd className={keyBadge}>1</kbd>
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={busy}
          onClick={() => onChoose("already_know")}
        >
          I already know this <kbd className={keyBadge}>2</kbd>
        </button>
      </div>
    </section>
  );
}

function Prompt({ q }: { q: PublicQuestion }) {
  const p = q.prompt;
  let body: ReactNode;
  if (p.gap) body = <Sentence text={p.text} start={p.gap.start} end={p.gap.end} gap />;
  else if (p.text === "") body = <span className={muted}>Listen to the word.</span>;
  else body = <span lang={p.lang}>{p.text}</span>;
  return (
    <div className="flex items-start justify-between gap-4">
      <p
        className={
          p.gap ? "text-2xl leading-relaxed" : "text-4xl font-semibold tracking-tight break-words"
        }
      >
        {body}
      </p>
      {q.speak && (
        <AudioButton src={q.speak.audioUrl} text={q.speak.text} label="Play audio" size="lg" />
      )}
    </div>
  );
}

export function QuestionView({
  question: q,
  onAnswer,
  busy,
}: {
  question: PublicQuestion;
  onAnswer: (a: { chosenIndex?: number; typed?: string; dontKnow?: boolean }) => void;
  busy: boolean;
}) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Listening questions play on their own when they appear.
  useEffect(() => {
    if (q.speak) playAudio(q.speak.audioUrl, q.speak.text);
    inputRef.current?.focus();
  }, [q]);

  useKeys((e) => {
    if (busy) return;
    if (q.mode === "choice") {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= (q.options?.length ?? 0))
        onAnswer({ chosenIndex: n - 1 });
    }
    if (e.key === "0" && !(e.target instanceof HTMLInputElement)) onAnswer({ dontKnow: true });
    if (e.key === " " && q.speak && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      playAudio(q.speak.audioUrl, q.speak.text);
    }
  });

  return (
    <section aria-label="Question" className="flex flex-col gap-8">
      <p className={`text-sm font-bold tracking-wide uppercase ${muted}`}>{q.instruction}</p>
      <Prompt q={q} />
      {q.note && <p className={muted}>{q.note}</p>}

      {q.mode === "choice" ? (
        <ol className="grid gap-3 sm:grid-cols-2">
          {q.options!.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAnswer({ chosenIndex: i })}
                className={`choice min-h-16 px-4 py-3 text-lg font-medium ${focusRing}`}
              >
                <kbd className={`${keyBadge} ${muted}`}>{i + 1}</kbd>
                <span lang={o.lang}>{o.text}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && typed.trim()) onAnswer({ typed });
          }}
        >
          <label className="sr-only" htmlFor="answer">
            Your answer
          </label>
          <input
            id="answer"
            ref={inputRef}
            lang="es"
            value={typed}
            maxLength={40}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            className={`field min-h-12 flex-1 px-4 text-xl ${focusRing}`}
          />
          <button type="submit" className={primaryButton} disabled={busy || !typed.trim()}>
            Check
          </button>
        </form>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => onAnswer({ dontKnow: true })}
        className={`inline-flex min-h-11 items-center gap-2 self-start rounded-lg px-2 font-semibold underline underline-offset-4 ${muted} ${focusRing}`}
      >
        I don&apos;t know{q.mode === "choice" && <kbd className={keyBadge}>0</kbd>}
      </button>
    </section>
  );
}

/** A filled check or cross, so the result never depends on color alone. */
function ResultIcon({ correct }: { correct: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-8 w-8 shrink-0 rounded-full p-1.5 text-white ${correct ? "bg-green-600" : "bg-red-600"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {correct ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
    </svg>
  );
}

export function FeedbackView({
  feedback: f,
  onContinue,
  disabled = false,
}: {
  feedback: Feedback;
  onContinue: () => void;
  /** True while the session is paused: keys go to the pause dialog, not this screen. */
  disabled?: boolean;
}) {
  const [waitMs, setWaitMs] = useState(f.requiredReadMs);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (waitMs <= 0) {
      buttonRef.current?.focus();
      return;
    }
    const t = setTimeout(() => setWaitMs((ms) => ms - 250), 250);
    return () => clearTimeout(t);
  }, [waitMs]);

  useKeys((e) => {
    if (disabled) return;
    if (e.key === "Enter" && waitMs <= 0) {
      e.preventDefault();
      onContinue();
    }
    if (e.key === " ") {
      e.preventDefault();
      const ex = f.word.example;
      if (f.correct && ex) playAudio(ex.audioUrl, ex.text);
      else playAudio(f.word.lemmaAudioUrl, f.word.display);
    }
  });

  const title = f.pretest
    ? f.correct
      ? "Good guess."
      : "Here is the word."
    : f.grade === "correct"
      ? "Correct."
      : f.grade === "hard"
        ? "Almost right."
        : "Not quite.";

  return (
    <section aria-label="Feedback" aria-live="polite" className="flex flex-col gap-6">
      <div
        className={`flex flex-col gap-1 rounded-2xl border-2 p-5 ${
          f.correct
            ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/60"
            : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/60"
        }`}
      >
        <p
          className={`flex items-center gap-3 text-2xl font-extrabold ${f.correct ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}
        >
          <ResultIcon correct={f.correct} />
          {title}
        </p>
        {!f.correct && (
          <p className="text-lg">
            Answer: <strong lang={f.correctAnswerLang}>{f.correctAnswer}</strong>
          </p>
        )}
        {f.chosenMeaning && (
          <p className={muted}>
            <Parts parts={f.chosenMeaning} />
          </p>
        )}
        {f.note && (
          <p className={muted}>
            <Parts parts={f.note} />
          </p>
        )}
        {f.integrityNote && (
          <p
            role="status"
            className="mt-2 rounded-xl bg-amber-100 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            {f.integrityNote}
          </p>
        )}
      </div>

      {f.correct && f.word.example ? (
        <div className="flex items-start gap-3">
          <AudioButton
            src={f.word.example.audioUrl}
            text={f.word.example.text}
            label="Play the example sentence"
          />
          <div>
            <p className="text-lg">
              <Sentence
                text={f.word.example.text}
                start={f.word.example.start}
                end={f.word.example.end}
              />
            </p>
            <p className={muted}>{f.word.example.translation}</p>
          </div>
        </div>
      ) : (
        !f.correct && <WordCard word={f.word} />
      )}

      <button
        ref={buttonRef}
        type="button"
        className={`${primaryButton} self-start`}
        disabled={waitMs > 0}
        onClick={onContinue}
      >
        {waitMs > 0 ? `Continue in ${Math.ceil(waitMs / 1000)}` : "Continue"}
      </button>
    </section>
  );
}

export function SummaryView({
  summary,
  onAgain,
}: {
  summary: SessionSummary;
  onAgain: () => void;
}) {
  return (
    <section aria-label="Session summary" className="flex flex-col gap-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Session complete</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Active minutes", summary.activeMinutes.toLocaleString("en-US")],
          ["Questions", String(summary.questions)],
          ["Accuracy", summary.accuracy === null ? "–" : `${summary.accuracy}%`],
          ["New words", String(summary.newWords)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <dt className={`text-sm font-semibold ${muted}`}>{label}</dt>
            <dd className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.words.length > 0 && (
        <div>
          <h2 className={`text-sm font-bold tracking-wide uppercase ${muted}`}>
            Words this session
          </h2>
          <ul className="card mt-3 divide-y-2 divide-ink-100 px-4 dark:divide-ink-800">
            {summary.words.map((w) => (
              <li key={w.senseId} className="flex items-center justify-between gap-4 py-2">
                <span>
                  <span lang="es" className="font-medium">
                    {w.display}
                  </span>{" "}
                  <span className={muted}>{w.gloss}</span>
                </span>
                <span
                  aria-label={`${w.results.filter(Boolean).length} of ${w.results.length} correct`}
                  className="flex gap-1"
                >
                  {w.results.map((r, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`h-3 w-3 rounded-full ${r ? "bg-green-600" : "bg-red-600"}`}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="button" className={primaryButton} onClick={onAgain}>
          Train again
        </button>
        {/* A teacher trying training is sent on to /teacher from here. */}
        <a href="/home" className={secondaryButton}>
          Home
        </a>
      </div>
    </section>
  );
}

export { primaryButton, secondaryButton };
