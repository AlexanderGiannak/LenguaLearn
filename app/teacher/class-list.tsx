"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, Field, muted, Page, postJson } from "@/app/_components/ui";

type ClassRow = { id: string; name: string; seats: number; joined: number };

export function ClassList({ classes }: { classes: ClassRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(form: FormData) {
    setBusy(true);
    setError(null);
    const r = await postJson<{ id: string }>("/api/teacher/classes", {
      name: String(form.get("name")),
      seats: Number(form.get("seats")),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push(`/teacher/class/${r.data.id}/seats`);
  }

  return (
    <Page title="Your classes">
      {classes.length === 0 ? (
        <p className={muted}>No classes yet.</p>
      ) : (
        <ul className="card divide-y-2 divide-ink-100 overflow-hidden dark:divide-ink-800">
          {classes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/teacher/class/${c.id}`}
                className="flex min-h-14 items-center justify-between px-4 hover:bg-ink-50 dark:hover:bg-ink-900"
              >
                <span className="font-medium">{c.name}</span>
                <span className={muted}>
                  {c.joined} of {c.seats} joined
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={create} className="flex flex-col gap-4 card p-4">
        <h2 className="text-xl font-semibold">New class</h2>
        <Field
          label="Class name"
          name="name"
          required
          maxLength={80}
          placeholder="Spanish 1, period 3"
        />
        <Field
          label="Seats"
          name="seats"
          type="number"
          required
          min={1}
          max={40}
          defaultValue={25}
          hint="One per student, up to 40. You can add more later."
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          Create class
        </Button>
      </form>
    </Page>
  );
}
