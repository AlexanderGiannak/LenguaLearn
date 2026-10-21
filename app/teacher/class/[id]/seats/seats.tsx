"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ErrorText, focusRing, muted, postJson } from "@/app/_components/ui";
import {
  labelsFile,
  loadLabels,
  readLabelsFile,
  saveLabels,
  type Labels,
} from "@/app/teacher/labels";

type SeatRow = {
  id: string;
  seatNumber: number;
  code: string | null;
  codeKind: "join" | "reset" | null;
  handle: string | null;
};

export function Seats({
  classId,
  className,
  initialSeats,
}: {
  classId: string;
  className: string;
  initialSeats: SeatRow[];
}) {
  const router = useRouter();
  const [seats, setSeats] = useState(initialSeats);
  const [labels, setLabels] = useState<Labels>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Labels load after the first render: the server never has them.
  useEffect(() => {
    const stored = loadLabels(classId);
    if (Object.keys(stored).length) queueMicrotask(() => setLabels(stored));
  }, [classId]);

  function setLabel(seatId: string, value: string) {
    const next = { ...labels, [seatId]: value };
    if (!value) delete next[seatId];
    setLabels(next);
    saveLabels(classId, next);
  }

  async function refresh() {
    const res = await fetch(`/api/teacher/classes/${classId}`);
    if (res.ok) setSeats(((await res.json()) as { seats: SeatRow[] }).seats);
  }

  async function act(run: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await run();
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    await refresh();
    setBusy(false);
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Seats" className="flex flex-col gap-6">
      <p className="rounded-md bg-brand-50 p-3 text-brand-900 dark:bg-brand-950 dark:text-brand-100">
        Names stay on this computer. LenguaLearn never receives them.
      </p>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/api/teacher/classes/${classId}/csv`}
          className={`btn btn-secondary px-4 ${focusRing}`}
        >
          Download codes (CSV)
        </a>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => act(() => postJson(`/api/teacher/classes/${classId}/seats`, { count: 1 }))}
        >
          Add a seat
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            download(labelsFile(classId, className, labels), `${className}-names.json`)
          }
        >
          Export names
        </Button>
        <Button variant="secondary" onClick={() => fileInput.current?.click()}>
          Import names
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const imported = await readLabelsFile(file, classId);
              const next = { ...labels, ...imported };
              setLabels(next);
              saveLabels(classId, next);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That file could not be read.");
            }
            e.target.value = "";
          }}
        />
      </div>
      <ErrorText>{error}</ErrorText>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className={`text-sm ${muted}`}>
            <tr>
              <th className="py-2 pr-3">Seat</th>
              <th className="py-2 pr-3">Name (this computer only)</th>
              <th className="py-2 pr-3">Code or handle</th>
              <th className="py-2" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
            {seats.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-3 font-medium">{s.seatNumber}</td>
                <td className="py-2 pr-3">
                  <input
                    aria-label={`Name for seat ${s.seatNumber}`}
                    value={labels[s.id] ?? ""}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(e) => setLabel(s.id, e.target.value)}
                    className={`min-h-11 w-full min-w-40 field px-2 ${focusRing}`}
                  />
                </td>
                <td className="py-2 pr-3">
                  {s.handle && <div className="font-mono">{s.handle}</div>}
                  {s.code && (
                    <div className={s.handle ? `text-sm ${muted}` : "font-mono"}>
                      {s.codeKind === "reset" ? "Reset code: " : ""}
                      <span className="font-mono">{s.code}</span>
                    </div>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => act(() => postJson(`/api/teacher/seats/${s.id}/reset`, {}))}
                  >
                    {s.handle ? "Reset password" : "New code"}
                  </Button>{" "}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Remove seat ${s.seatNumber}?`)) {
                        void act(() => postJson(`/api/teacher/seats/${s.id}`, {}, "DELETE"));
                      }
                    }}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-ink-200 pt-6 dark:border-ink-800">
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (
              !confirm(
                `Delete ${className}? Download the codes first if you need them. Students with no other class are deleted after 30 days.`,
              )
            )
              return;
            const r = await postJson(`/api/teacher/classes/${classId}`, {}, "DELETE");
            if (r.ok) router.push("/teacher");
            else setError(r.error);
          }}
        >
          Delete class
        </Button>
      </div>
    </section>
  );
}
