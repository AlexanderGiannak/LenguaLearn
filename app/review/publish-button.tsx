"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, muted, postJson } from "@/app/_components/ui";

/** Admin only: puts every approved row live. */
export function PublishButton({ approved }: { approved: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function publish() {
    if (!confirm(`Publish ${approved} approved senses, and approved pseudowords, to students?`))
      return;
    setBusy(true);
    setError(null);
    const r = await postJson<{ senses: number; pseudowords: number }>("/api/review/publish", {});
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setDone(`Published ${r.data.senses} senses and ${r.data.pseudowords} pseudowords.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 card p-4">
      <Button onClick={publish} disabled={busy} className="self-start">
        Publish approved content
      </Button>
      <p className={`text-sm ${muted}`}>
        Only you can do this. Students see a word once it is live.
      </p>
      {done && <p role="status">{done}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
