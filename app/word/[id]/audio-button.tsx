"use client";

import { useState } from "react";

// Plays the stored recording when there is one. Until Polly audio exists (Phase 9), or if
// the file fails to load, it falls back to the browser's own Spanish voice. Only content
// text is spoken; it never includes anything about the student.

function speak(text: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("es"));
  // Prefer voices that run on the device over ones that send text to a cloud service.
  const voice =
    voices.find((v) => v.localService && /es[-_](MX|US|419)/.test(v.lang)) ??
    voices.find((v) => v.localService) ??
    voices[0];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice?.lang ?? "es-MX";
  if (voice) utterance.voice = voice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function AudioButton({
  src,
  text,
  label,
  size = "md",
}: {
  src: string | null;
  text: string;
  label: string;
  size?: "md" | "lg";
}) {
  const [unavailable, setUnavailable] = useState(false);

  function play() {
    const fallback = () => {
      if (!speak(text)) setUnavailable(true);
    };
    if (src) {
      new Audio(src).play().catch(fallback);
    } else {
      fallback();
    }
  }

  return (
    <button
      type="button"
      onClick={play}
      disabled={unavailable}
      aria-label={unavailable ? `${label} (audio not available in this browser)` : label}
      title={unavailable ? "Audio is not available in this browser" : label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 ${
        size === "lg" ? "h-14 w-14" : "h-11 w-11"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={size === "lg" ? "h-7 w-7" : "h-5 w-5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}
