"use client";

import { Button } from "@/app/_components/ui";

// Google sign-in, for teachers and independent learners only. Never shown on the class
// student pages (/student, /join): a school Google account would send the student's name.
export function GoogleButton({
  label,
  ageConfirmed,
}: {
  label: string;
  /** On the sign-up page: Google sign-up needs the 13-or-older box ticked first. */
  ageConfirmed?: boolean;
}) {
  async function go() {
    if (ageConfirmed) {
      await fetch("/api/account/age-confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ageConfirmed: true }),
      });
    }
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.assign(data.url);
  }
  return (
    <Button variant="secondary" onClick={go} disabled={ageConfirmed === false}>
      {label}
    </Button>
  );
}
