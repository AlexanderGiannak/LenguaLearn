import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-24">
      <h1 className="text-3xl font-extrabold tracking-tight">Page not found</h1>
      <p className="text-lg text-ink-600 dark:text-ink-400">
        This page doesn&apos;t exist, or the word isn&apos;t published yet.
      </p>
      <p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-brand-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:text-brand-300"
        >
          Go to the home page
        </Link>
      </p>
    </main>
  );
}
