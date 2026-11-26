"use client";

import { useRef, useState } from "react";
import {
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  REPORT_TEXT_MAX,
  type ReportReason,
} from "@/lib/review/report-reasons";
import { focusRing, primaryButton, secondaryButton } from "./views";

// "Report a problem" (spec: Content pipeline, step 5). It sends only the question's ID,
// the reason and the optional text: the server works out which word it was. The trainer's
// keyboard shortcuts ignore keys pressed inside this dialog.

export function ReportProblem({ questionId }: { questionId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");

  const open = () => {
    setReason(null);
    setText("");
    setState("idle");
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setState("sending");
    try {
      const res = await fetch("/api/train/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, reason, ...(text.trim() ? { text } : {}) }),
      });
      if (res.ok) return setState("sent");
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ error: res.status === 429 && body.error ? body.error : "Not sent. Try again." });
    } catch {
      setState({ error: "Can't reach the server. Try again." });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`min-h-11 self-start rounded px-1 text-sm text-ink-600 underline underline-offset-2 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50 ${focusRing}`}
      >
        Report a problem
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`report-${questionId}`}
        className="card m-auto w-[min(32rem,calc(100vw-2rem))] p-6 text-inherit shadow-xl backdrop:bg-ink-950/60"
      >
        {state === "sent" ? (
          <div className="flex flex-col gap-4">
            <h2 id={`report-${questionId}`} className="text-2xl font-extrabold">
              Thanks for telling us
            </h2>
            <p>A reviewer will look at this question. Keep going with your session.</p>
            <button
              type="button"
              autoFocus
              className={`${primaryButton} self-start`}
              onClick={close}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-4">
            <h2 id={`report-${questionId}`} className="text-2xl font-extrabold">
              Report a problem
            </h2>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 font-semibold">What&apos;s wrong?</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="h-5 w-5 accent-brand-600"
                  />
                  {REPORT_REASON_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Anything else? (optional)</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={REPORT_TEXT_MAX}
                rows={3}
                aria-describedby={`report-note-${questionId}`}
                className={`field w-full ${focusRing}`}
              />
              <span
                id={`report-note-${questionId}`}
                className="text-sm text-ink-600 dark:text-ink-300"
              >
                Don&apos;t include your name or other personal details.
              </span>
            </label>
            {typeof state === "object" && (
              <p role="alert" className="text-red-700 dark:text-red-300">
                {state.error}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className={primaryButton}
                disabled={!reason || state === "sending"}
              >
                {state === "sending" ? "Sending…" : "Send report"}
              </button>
              <button type="button" className={secondaryButton} onClick={close}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
