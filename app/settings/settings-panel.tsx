"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button, ErrorText, Field, focusRing, muted, Page, postJson } from "@/app/_components/ui";
import { PreferencesPanel } from "./preferences-panel";

export function SettingsPanel({
  role,
  handle,
  email,
  needsVerification,
}: {
  role: string;
  handle: string;
  email: string | null;
  needsVerification: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changePassword(form: FormData) {
    setError(null);
    const r = await postJson("/api/auth/change-password", {
      currentPassword: String(form.get("current")),
      newPassword: String(form.get("next")),
      revokeOtherSessions: true,
    });
    if (!r.ok) return setError("That didn't work. Check your current password.");
    setMessage("Password changed.");
  }

  async function deleteAccount(form: FormData) {
    setError(null);
    const r = await postJson("/api/account/delete", { confirm: String(form.get("confirm")) });
    if (!r.ok) return setError(r.error);
    router.push("/");
  }

  return (
    <Page title="Settings">
      {needsVerification && (
        <div className="flex flex-col gap-3 rounded-md bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p>Confirm your email address to set up classes. Check your inbox for our link.</p>
          <Button
            variant="secondary"
            onClick={async () => {
              const r = await postJson("/api/auth/send-verification-email", {
                email,
                callbackURL: "/teacher",
              });
              setMessage(r.ok ? "Sent. Check your email." : "Could not send the email right now.");
            }}
          >
            Send the link again
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Account</h2>
        <p>
          {role === "student" ? "Handle" : "Name"}: <span className="font-mono">{handle}</span>
        </p>
        {email && <p>Email: {email}</p>}
      </section>

      {message && <p role="status">{message}</p>}
      <ErrorText>{error}</ErrorText>

      <form action={changePassword} className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Change password</h2>
        <Field
          label="Current password"
          name="current"
          type="password"
          required
          autoComplete="current-password"
        />
        <Field
          label="New password"
          name="next"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" variant="secondary">
          Change password
        </Button>
      </form>

      {role === "learner" && email && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Teaching</h2>
          <p className={muted}>Switch to a teacher account to create classes.</p>
          <Button
            variant="secondary"
            onClick={async () => {
              const r = await postJson("/api/account/become-teacher", {});
              if (!r.ok) return setError(r.error);
              router.push("/teacher");
            }}
          >
            I&apos;m a teacher
          </Button>
        </section>
      )}

      <PreferencesPanel />

      {role === "student" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Classes</h2>
          <Link href="/join" className={`inline-flex min-h-11 items-center underline ${focusRing}`}>
            Join another class with a code
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Your data</h2>
        <a
          href="/api/account/export"
          className={`inline-flex min-h-11 items-center underline ${focusRing}`}
        >
          Download everything LenguaLearn has about you (JSON)
        </a>
      </section>

      <Button
        variant="secondary"
        onClick={async () => {
          await postJson("/api/auth/sign-out", {});
          router.push("/");
        }}
      >
        Sign out
      </Button>

      <form
        action={deleteAccount}
        className="flex flex-col gap-4 border-t border-ink-200 pt-6 dark:border-ink-800"
      >
        <h2 className="text-xl font-semibold">Delete account</h2>
        <p className={muted}>
          This deletes your account and all your progress right away. It can&apos;t be undone.
          {role === "teacher" && " Your classes are deleted too."}
        </p>
        <Field
          label="Type your password to confirm"
          name="confirm"
          type="password"
          required
          hint="If you only sign in with Google, type DELETE."
        />
        <Button type="submit" variant="danger">
          Delete my account
        </Button>
      </form>
    </Page>
  );
}
