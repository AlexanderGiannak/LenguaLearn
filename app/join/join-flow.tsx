"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, Field, muted, Page, postJson } from "@/app/_components/ui";

// Spec: Class student flow. Enter the seat code, choose a password, get a random handle.
// The student never types a name or an email, and Google sign-in is never offered here.

type Step =
  | { kind: "code" }
  | { kind: "password"; code: string; codeKind: "join" | "reset"; className: string }
  | { kind: "done"; handle: string; reset: boolean };

export function JoinFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "code" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function checkCode(form: FormData) {
    setBusy(true);
    setError(null);
    const code = String(form.get("code"));
    const r = await postJson<{ kind: "join" | "reset"; className: string }>("/api/join/check", {
      code,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStep({ kind: "password", code, codeKind: r.data.kind, className: r.data.className });
  }

  async function redeem(form: FormData) {
    if (step.kind !== "password") return;
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const r = await postJson<{ handle: string }>("/api/join/redeem", {
      code: step.code,
      kind: step.codeKind,
      password,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStep({ kind: "done", handle: r.data.handle, reset: step.codeKind === "reset" });
  }

  if (step.kind === "done") {
    return (
      <Page title={step.reset ? "Password changed" : "You're in"}>
        <p className="text-lg">Your handle is</p>
        <p className="rounded-lg border-2 border-ink-900 p-4 text-center font-mono text-3xl font-semibold dark:border-ink-100">
          {step.handle}
        </p>
        <p className="text-lg">
          <strong>Write it down.</strong> You sign in with this handle and your password. Your
          teacher can give you a reset code if you forget the password.
        </p>
        <Button onClick={() => router.push("/train")}>Start training</Button>
      </Page>
    );
  }

  return (
    <Page title="Join a class">
      {step.kind === "code" ? (
        <form action={checkCode} className="flex flex-col gap-4">
          <Field
            label="Code from your teacher"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="K7QM-4TPX"
            className="font-mono uppercase"
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            Continue
          </Button>
          <p className={muted}>
            Already joined?{" "}
            <Link className="underline" href="/student">
              Sign in with your handle
            </Link>
            .
          </p>
        </form>
      ) : (
        <form action={redeem} className="flex flex-col gap-4">
          <p className="text-lg">
            {step.codeKind === "reset" ? "Choose a new password for your account in " : "Joining "}
            <strong>{step.className}</strong>.
          </p>
          <p className={muted}>Don&apos;t use your name or school email in your password.</p>
          <Field
            label="Choose a password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            hint="At least 8 characters."
          />
          <Field
            label="Type it again"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy}>
            {step.codeKind === "reset" ? "Save password" : "Join"}
          </Button>
        </form>
      )}
    </Page>
  );
}
