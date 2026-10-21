"use client";

import { Button } from "@/app/_components/ui";

// Google sign-in, for teachers and independent learners only. Never shown on the class
// student pages (/student, /join): a school Google account would send the student's name.
export function GoogleButton({ label }: { label: string }) {
  async function go() {
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.assign(data.url);
  }
  return (
    <Button variant="secondary" onClick={go}>
      {label}
    </Button>
  );
}
