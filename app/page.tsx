import Link from "next/link";

const link =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">LenguaLearn</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Spanish vocabulary, a few minutes a day.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/train"
          className={`${link} bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900`}
        >
          Start training
        </Link>
        <Link href="/join" className={`${link} border border-zinc-300 dark:border-zinc-700`}>
          Join a class
        </Link>
        <Link href="/student" className={`${link} border border-zinc-300 dark:border-zinc-700`}>
          Student sign in
        </Link>
        <Link href="/sign-in" className={`${link} border border-zinc-300 dark:border-zinc-700`}>
          Sign in
        </Link>
        <Link href="/sign-up" className={`${link} border border-zinc-300 dark:border-zinc-700`}>
          Create an account
        </Link>
        <Link href="/teacher" className={`${link} underline`}>
          Teachers
        </Link>
      </div>
    </main>
  );
}
