"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, focusRing, postJson } from "@/app/_components/ui";

export function GoalEditor({ initial }: { initial: number }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await postJson("/api/learner/goal", { minutes });
        if (r.ok) {
          setSaved(true);
          router.refresh();
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">Weekly goal (minutes)</span>
        <input
          type="number"
          min={5}
          max={2000}
          value={minutes}
          onChange={(e) => {
            setMinutes(Number(e.target.value));
            setSaved(false);
          }}
          className={`min-h-11 w-32 field ${focusRing}`}
        />
      </label>
      <Button type="submit" variant="secondary">
        Save goal
      </Button>
      {saved && <span role="status">Saved.</span>}
    </form>
  );
}
