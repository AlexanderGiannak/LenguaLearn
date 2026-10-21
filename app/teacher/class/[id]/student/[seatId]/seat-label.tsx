"use client";

import { useEffect, useState } from "react";
import { loadLabels } from "@/app/teacher/labels";

/** The local-only name label for a seat, read from this browser. */
export function SeatLabel({
  classId,
  seatId,
  fallback,
}: {
  classId: string;
  seatId: string;
  fallback: string;
}) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const value = loadLabels(classId)[seatId] ?? null;
    queueMicrotask(() => setLabel(value));
  }, [classId, seatId]);
  return <span className="font-normal text-zinc-600 dark:text-zinc-400">{label ?? fallback}</span>;
}
