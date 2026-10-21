"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ErrorText, Field, muted, Page, postJson } from "@/app/_components/ui";
import { GoogleButton } from "./google-button";

export function SignInForm({
  googleEnabled,
  student,
}: {
  googleEnabled: boolean;
  student: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const r = await postJson("/api/account/sign-in", {
      identifier: String(form.get("identifier")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const next = new URLSearchParams(window.location.search).get("next");
    // /home sends a teacher on to /teacher and an unplaced learner to /placement.
    window.location.assign(safeNext(next) ?? "/home");
  }

  return (
    <Page title={student ? "Student sign in" : "Sign in"}>
      <form action={submit} className="flex flex-col gap-4">
        <Field
          label={student ? "Your handle" : "Email or username"}
          name="identifier"
          required
          autoComplete="username"
          autoCapitalize="off"
          placeholder={student ? "quiet-otter-42" : undefined}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          Sign in
        </Button>
      </form>
      {student ? (
        <p className={muted}>
          New to your class?{" "}
          <Link className="underline" href="/join">
            Join with your code
          </Link>
          . Forgot your password? Ask your teacher for a reset code.
        </p>
      ) : (
        <>
          {googleEnabled && <GoogleButton label="Sign in with Google" />}
          <p className={muted}>
            In a class?{" "}
            <Link className="underline" href="/student">
              Student sign in
            </Link>
            . No account?{" "}
            <Link className="underline" href="/sign-up">
              Create one
            </Link>
            .
          </p>
        </>
      )}
    </Page>
  );
}

/** Only same-origin destinations, so a crafted ?next= cannot send people elsewhere. */
function safeNext(next: string | null): string | null {
  if (!next) return null;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}
