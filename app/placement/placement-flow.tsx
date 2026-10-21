"use client";

import { useEffect, useState } from "react";
import { Button, ErrorText, focusRing, link, muted, Page, postJson } from "@/app/_components/ui";

// Spec: Placement. Total beginners start at level 1. Everyone else answers about 40 "Do you
// know this word?" items, some of them made-up words; saying yes to those lowers the score.

type Screen =
  | { done: false; placementId: string; token: string; text: string; index: number; total: number }
  | { done: true; level: number; reliable: boolean };

export function PlacementFlow() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin(mode: "beginner" | "test") {
    setBusy(true);
    const r = await postJson<Screen>("/api/placement/start", {
      mode,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setScreen(r.data);
  }

  async function answer(yes: boolean) {
    if (!screen || screen.done || busy) return;
    setBusy(true);
    const r = await postJson<Screen>("/api/placement/answer", {
      placementId: screen.placementId,
      token: screen.token,
      yes,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setScreen(r.data);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!screen || screen.done) return;
      if (e.key === "y" || e.key === "1") void answer(true);
      if (e.key === "n" || e.key === "2") void answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!screen) {
    return (
      <Page title="Find your level">
        <p className="text-lg">How much Spanish do you know?</p>
        <div className="flex flex-col gap-3">
          <Button disabled={busy} onClick={() => begin("beginner")}>
            I&apos;m a total beginner
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => begin("test")}>
            I know some Spanish
          </Button>
        </div>
        <p className={muted}>
          The level check takes about 3 minutes. Some of the words are made up, so only say yes if
          you know a word.
        </p>
        <ErrorText>{error}</ErrorText>
      </Page>
    );
  }

  if (screen.done) {
    return (
      <Page title="Your starting level">
        <p className="text-5xl font-extrabold text-brand-700 dark:text-brand-300">
          Level {screen.level}
        </p>
        <p className="text-lg">
          {screen.reliable
            ? "New words start here. Easier words you probably know are checked along the way instead of taught."
            : "That was hard to read, so you'll start at level 1. You'll move up quickly through words you know."}
        </p>
        {/* A full page load: the router may hold /train's earlier redirect to this page. */}
        <a href="/train" className={`btn btn-primary min-h-12 text-lg ${focusRing}`}>
          Start training
        </a>
        <a href="/home" className={`${link} inline-flex min-h-11 items-center justify-center`}>
          Go to your home page
        </a>
      </Page>
    );
  }

  return (
    <Page title="Do you know this word?">
      <p className={muted}>
        {screen.index} of {screen.total}
      </p>
      <p lang="es" className="card px-4 py-12 text-center text-5xl font-extrabold break-words">
        {screen.text}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button className="min-h-14 text-lg" disabled={busy} onClick={() => answer(true)}>
          Yes <kbd className="text-sm opacity-70">Y</kbd>
        </Button>
        <Button
          variant="secondary"
          className="min-h-14 text-lg"
          disabled={busy}
          onClick={() => answer(false)}
        >
          No <kbd className="text-sm opacity-70">N</kbd>
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Page>
  );
}
