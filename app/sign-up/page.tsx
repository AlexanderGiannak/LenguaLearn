import type { Metadata } from "next";
import Link from "next/link";
import { focusRing, link } from "@/app/_components/styles";
import { isDemoSite } from "@/lib/demo/config";
import { signupsOpen, tryDemoHref } from "@/lib/site/config";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account · LenguaLearn" };

export default function SignUpPage() {
  if (!signupsOpen(process.env)) {
    // lengualearn.com before opening; the sign-up route refuses as well.
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight">Opening soon</h1>
        <p className="text-lg text-ink-600 dark:text-ink-400">
          We&apos;re preparing the first 500 words, and each one is reviewed by hand before it goes
          live. Accounts open when they&apos;re ready.
        </p>
        <p className="text-lg text-ink-600 dark:text-ink-400">
          Meanwhile, the demo runs the full app with sample words, for learners and for teachers.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={tryDemoHref(process.env)}
            className={`btn btn-primary min-h-12 px-6 text-lg ${focusRing}`}
          >
            Try the demo
          </a>
          <Link
            href="/how-it-works"
            className={`btn btn-secondary min-h-12 px-6 text-lg ${focusRing}`}
          >
            How it works
          </Link>
        </div>
        <p>
          Already have an account?{" "}
          <Link href="/sign-in" className={link}>
            Sign in
          </Link>
        </p>
      </main>
    );
  }
  return (
    <SignUpForm
      googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)}
      demoSite={isDemoSite(process.env)}
    />
  );
}
