"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canSpeak } from "@/app/_components/audio-button";
import type { AnswerResponse, Feedback, Screen, SessionSummary } from "@/lib/train/types";
import { pendingRequest, sendQueued, type SendResult } from "./queue";
import {
  FeedbackView,
  focusRing,
  IntroView,
  primaryButton,
  QuestionView,
  SummaryView,
} from "./views";

// The training session in the browser. The server decides every screen; this component
// shows it, measures time, and sends answers through the retry queue.

type View =
  | { kind: "start" }
  | { kind: "screen"; screen: Exclude<Screen, { kind: "done" }> }
  | { kind: "feedback"; feedback: Feedback; next: Screen }
  | { kind: "summary"; summary: SessionSummary }
  | { kind: "error"; message: string };

const SESSION_KEY = "lengualearn.session";
type Saved = { sessionId: string; plannedMs: number };

function saveSession(s: Saved | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage may be blocked; the session still works until a reload.
  }
}
function loadSession(): Saved | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/** Visible time only: a hidden tab does not count (spec: Active time). */
function useVisibleClock() {
  const last = useRef(0);
  const visibleSince = useRef<number | null>(null);
  const banked = useRef(0);
  useEffect(() => {
    visibleSince.current = document.visibilityState === "visible" ? performance.now() : null;
    const onChange = () => {
      if (document.visibilityState === "visible") visibleSince.current = performance.now();
      else if (visibleSince.current !== null) {
        banked.current += performance.now() - visibleSince.current;
        visibleSince.current = null;
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  const total = useCallback(
    () =>
      banked.current +
      (visibleSince.current === null ? 0 : performance.now() - visibleSince.current),
    [],
  );
  return useMemo(
    () => ({
      /** Visible ms since the last lap, and starts a new lap. */
      lap: () => {
        const now = total();
        const ms = now - last.current;
        last.current = now;
        return Math.round(ms);
      },
      /** Visible ms since the last lap, without starting a new one. */
      peek: () => Math.round(total() - last.current),
    }),
    [total],
  );
}

export function Trainer() {
  const [view, setView] = useState<View>({ kind: "start" });
  const [session, setSession] = useState<Saved | null>(null);
  const [activeMs, setActiveMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [, tick] = useState(0);
  const clock = useVisibleClock();
  const questionShownAt = useRef(0);

  const send = useCallback(async (url: string, body: unknown): Promise<SendResult> => {
    setBusy(true);
    const result = await sendQueued({ url, body }, { onRetry: () => setReconnecting(true) });
    setReconnecting(false);
    setBusy(false);
    return result;
  }, []);

  const show = useCallback(
    async (screen: Screen, saved: Saved | null) => {
      if (screen.kind === "done") {
        if (!saved) return setView({ kind: "start" });
        const r = await send("/api/train/end", { sessionId: saved.sessionId });
        saveSession(null);
        setView(
          r.ok
            ? { kind: "summary", summary: r.data as SessionSummary }
            : { kind: "error", message: r.error },
        );
        return;
      }
      questionShownAt.current = clock.peek();
      setView({ kind: "screen", screen });
    },
    [send, clock],
  );

  const handleAnswerResult = useCallback((r: SendResult) => {
    if (!r.ok) return setView({ kind: "error", message: r.error });
    const data = r.data as AnswerResponse;
    setActiveMs(data.activeMs);
    setView({ kind: "feedback", feedback: data.feedback, next: data.next });
  }, []);

  // After a reload, resend an answer that never reached the server. Once, on mount: a
  // request saved later is still in flight, not left over.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const pending = pendingRequest();
    const saved = loadSession();
    if (!pending || !saved) return;
    void (async () => {
      const r = await send(pending.url, pending.body);
      setSession(saved);
      if (pending.url.endsWith("/answer")) handleAnswerResult(r);
      else if (pending.url.endsWith("/intro") && r.ok) {
        void show((r.data as { next: Screen }).next, saved);
      } else if (pending.url.endsWith("/end") && r.ok) {
        saveSession(null);
        setView({ kind: "summary", summary: r.data as SessionSummary });
      }
    })();
  }, [send, show, handleAnswerResult]);

  // Redraw the time bar every second.
  useEffect(() => {
    if (view.kind !== "screen" && view.kind !== "feedback") return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [view.kind]);

  async function start() {
    const minutes = Number(new URLSearchParams(window.location.search).get("minutes")) || undefined;
    const r = await send("/api/train/start", {
      audio: canSpeak(),
      ...(minutes ? { minutes } : {}),
    });
    if (!r.ok) return setView({ kind: "error", message: r.error });
    const data = r.data as { sessionId: string; plannedMs: number; screen: Screen };
    const saved = { sessionId: data.sessionId, plannedMs: data.plannedMs };
    saveSession(saved);
    setSession(saved);
    setActiveMs(0);
    clock.lap();
    await show(data.screen, saved);
  }

  async function chooseIntro(choice: "got_it" | "already_know") {
    if (view.kind !== "screen" || busy) return;
    const r = await send("/api/train/intro", {
      questionId: view.screen.id,
      choice,
      activeMs: clock.lap(),
    });
    if (!r.ok) return setView({ kind: "error", message: r.error });
    const data = r.data as { next: Screen; activeMs: number };
    setActiveMs(data.activeMs);
    await show(data.next, session);
  }

  async function answer(a: { chosenIndex?: number; typed?: string; dontKnow?: boolean }) {
    if (view.kind !== "screen" || busy) return;
    const responseMs = Math.max(0, clock.peek() - questionShownAt.current);
    handleAnswerResult(
      await send("/api/train/answer", {
        questionId: view.screen.id,
        clientAnswerId: crypto.randomUUID(),
        ...a,
        responseMs,
        activeMs: clock.lap(),
      }),
    );
  }

  async function endEarly() {
    if (!session) return;
    await show({ kind: "done" }, session);
  }

  const shownMs =
    activeMs + (view.kind === "screen" || view.kind === "feedback" ? clock.peek() : 0);
  const planned = session?.plannedMs ?? 1;
  const minutesLeft = Math.max(0, Math.ceil((planned - shownMs) / 60_000));
  const inSession = view.kind === "screen" || view.kind === "feedback";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6 sm:py-10">
      {inSession && (
        <header className="mb-8 flex flex-col gap-2">
          <div
            role="progressbar"
            aria-label="Session time"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round((100 * shownMs) / planned))}
            className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          >
            <div
              className="h-full bg-zinc-900 transition-[width] dark:bg-zinc-100"
              style={{ width: `${Math.min(100, (100 * shownMs) / planned)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
            <span>{minutesLeft === 0 ? "Last question" : `${minutesLeft} min left`}</span>
            <button
              type="button"
              onClick={endEarly}
              disabled={busy}
              className={`min-h-11 px-2 underline underline-offset-4 ${focusRing}`}
            >
              End session
            </button>
          </div>
        </header>
      )}

      {reconnecting && (
        <p
          role="status"
          className="mb-4 rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          Reconnecting… your answer is saved and will be sent.
        </p>
      )}

      {view.kind === "start" && (
        <section className="flex flex-1 flex-col justify-center gap-6">
          <h1 className="text-3xl font-semibold tracking-tight">Ready to train?</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            A short session of new words and reviews.
          </p>
          <button
            type="button"
            className={`${primaryButton} self-start`}
            onClick={start}
            disabled={busy}
          >
            Start training
          </button>
        </section>
      )}
      {view.kind === "screen" && view.screen.kind === "intro" && (
        <IntroView
          key={view.screen.id}
          word={view.screen.word}
          onChoose={chooseIntro}
          busy={busy}
        />
      )}
      {view.kind === "screen" && view.screen.kind === "question" && (
        <QuestionView
          key={view.screen.id}
          question={view.screen.question}
          onAnswer={answer}
          busy={busy}
        />
      )}
      {view.kind === "feedback" && (
        <FeedbackView
          key={`feedback-${view.next.kind === "done" ? "done" : view.next.id}`}
          feedback={view.feedback}
          onContinue={() => void show(view.next, session)}
        />
      )}
      {view.kind === "summary" && (
        <SummaryView summary={view.summary} onAgain={() => setView({ kind: "start" })} />
      )}
      {view.kind === "error" && (
        <section className="flex flex-col gap-4">
          <p role="alert" className="text-lg">
            Something went wrong: {view.message}
          </p>
          <button
            type="button"
            className={`${primaryButton} self-start`}
            onClick={() => setView({ kind: "start" })}
          >
            Start over
          </button>
        </section>
      )}
    </main>
  );
}
