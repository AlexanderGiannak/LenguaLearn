"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, muted, Page, postJson } from "@/app/_components/ui";
import type { ContentStatus } from "@/lib/content/constants";

type Word = { id: number; text: string; status: ContentStatus };

/**
 * Placement pseudowords: made-up words that must not be real Spanish, a name, or easy to
 * misread as a common word. Tick the bad ones and reject them; approve the rest.
 */
export function PseudowordList({ words }: { words: Word[] }) {
  const router = useRouter();
  const [bad, setBad] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = words.filter((w) => w.status !== "approved");
  const approved = words.length - waiting.length;

  async function decide() {
    setBusy(true);
    setError(null);
    const rejectIds = waiting.filter((w) => bad.has(w.id)).map((w) => w.id);
    const approveIds = waiting.filter((w) => !bad.has(w.id)).map((w) => w.id);
    for (const [ids, action] of [
      [rejectIds, "reject"],
      [approveIds, "approve"],
    ] as const) {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await postJson("/api/review/pseudowords", { ids: ids.slice(i, i + 500), action });
        if (!r.ok) {
          setBusy(false);
          return setError(r.error);
        }
      }
    }
    setBusy(false);
    setBad(new Set());
    router.refresh();
  }

  return (
    <Page title="Pseudowords" back={{ href: "/review", label: "Review queue" }}>
      <p className={muted}>
        The placement test asks whether learners know these made-up words. Tick any that are real
        Spanish words, names, rude, or one letter from a common word. The ticked ones are rejected;
        the rest are approved.
      </p>
      {waiting.length === 0 ? (
        <p className={muted}>Nothing to review. {approved} approved and waiting to publish.</p>
      ) : (
        <>
          <fieldset className="card grid grid-cols-2 gap-x-4 p-4 sm:grid-cols-3">
            <legend className="sr-only">Pseudowords to reject</legend>
            {waiting.map((w) => (
              <label key={w.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={bad.has(w.id)}
                  onChange={(e) => {
                    const next = new Set(bad);
                    if (e.target.checked) next.add(w.id);
                    else next.delete(w.id);
                    setBad(next);
                  }}
                />
                <span lang="es">{w.text}</span>
              </label>
            ))}
          </fieldset>
          <ErrorText>{error}</ErrorText>
          <Button onClick={decide} disabled={busy} className="self-start">
            Reject {bad.size}, approve {waiting.length - bad.size}
          </Button>
        </>
      )}
    </Page>
  );
}
