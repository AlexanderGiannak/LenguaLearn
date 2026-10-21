"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorText, Field, muted, Page, postJson } from "@/app/_components/ui";
import { GoogleButton } from "../sign-in/google-button";

// Teachers and independent learners. Class students never sign up here: they join with a
// seat code at /join, and are never offered Google sign-in.

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [role, setRole] = useState<"learner" | "teacher">("learner");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const body =
      role === "teacher"
        ? {
            role,
            name: String(form.get("name")),
            email: String(form.get("email")),
            password: String(form.get("password")),
          }
        : {
            role,
            username: String(form.get("username")),
            password: String(form.get("password")),
            ...(form.get("email") ? { email: String(form.get("email")) } : {}),
            ageConfirmed: form.get("age") === "on" ? true : undefined,
          };
    const r = await postJson("/api/account/sign-up", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (role === "teacher") setCheckEmail(true);
    else router.push("/train");
  }

  if (checkEmail) {
    return (
      <Page title="Check your email">
        <p className="text-lg">
          We sent a link to confirm your email address. Open it to start setting up your classes.
        </p>
      </Page>
    );
  }

  return (
    <Page title="Create an account">
      <fieldset className="flex gap-2">
        <legend className="sr-only">Account type</legend>
        {(["learner", "teacher"] as const).map((r) => (
          <Button
            key={r}
            variant={role === r ? "primary" : "secondary"}
            aria-pressed={role === r}
            onClick={() => setRole(r)}
          >
            {r === "learner" ? "I'm learning on my own" : "I'm a teacher"}
          </Button>
        ))}
      </fieldset>
      <p className={muted}>
        In a class? Use the code from your teacher at{" "}
        <Link className="underline" href="/join">
          Join a class
        </Link>
        .
      </p>

      <form action={submit} className="flex flex-col gap-4">
        {role === "teacher" ? (
          <>
            <Field label="Your name" name="name" required autoComplete="name" />
            <Field label="School email" name="email" type="email" required autoComplete="email" />
          </>
        ) : (
          <>
            <Field
              label="Username"
              name="username"
              required
              autoComplete="username"
              minLength={3}
              maxLength={30}
            />
            <Field
              label="Email (optional)"
              name="email"
              type="email"
              autoComplete="email"
              hint="Only used to reset your password."
            />
          </>
        )}
        <Field
          label="Password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        {role === "learner" && (
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="age" required className="h-5 w-5" />
            <span>I am 13 or older.</span>
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>
          Create account
        </Button>
      </form>
      {googleEnabled && <GoogleButton label="Sign up with Google" />}
      <p className={muted}>
        Already have an account?{" "}
        <Link className="underline" href="/sign-in">
          Sign in
        </Link>
      </p>
    </Page>
  );
}
