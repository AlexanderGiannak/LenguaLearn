import Link from "next/link";
import { focusRing, link } from "./_components/styles";

const features = [
  {
    title: "A few minutes a day",
    text: "Short timed sessions mix new words with reviews, so every minute counts.",
    icon: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  },
  {
    title: "Back right before you forget",
    text: "Each word returns when you're about to lose it, with harder questions as you learn it.",
    icon: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  },
  {
    title: "Free, with no ads",
    text: "Made for classrooms. Students join with a code, with no name or email.",
    icon: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z",
  },
];

/** Decorative: a lesson card with answer choices, one picked right. No real content. */
function Illustration() {
  return (
    <svg viewBox="0 0 320 280" aria-hidden="true" className="w-full max-w-sm">
      <rect
        x="40"
        y="30"
        width="250"
        height="220"
        rx="24"
        className="fill-brand-100 dark:fill-brand-950"
      />
      <rect
        x="22"
        y="14"
        width="250"
        height="220"
        rx="24"
        className="fill-white stroke-ink-200 dark:fill-ink-900 dark:stroke-ink-800"
        strokeWidth="3"
      />
      <rect
        x="46"
        y="38"
        width="120"
        height="14"
        rx="7"
        className="fill-ink-200 dark:fill-ink-700"
      />
      <rect
        x="46"
        y="62"
        width="170"
        height="22"
        rx="11"
        className="fill-ink-800 dark:fill-ink-200"
      />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x="46"
          y={104 + i * 40}
          width="202"
          height="30"
          rx="12"
          strokeWidth="3"
          className={
            i === 1
              ? "fill-green-50 stroke-green-500 dark:fill-green-950"
              : "fill-white stroke-ink-200 dark:fill-ink-900 dark:stroke-ink-700"
          }
        />
      ))}
      <circle cx="262" cy="159" r="22" className="fill-green-600" />
      <path
        d="M252 159l7 7 13-14"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="270" cy="38" r="26" className="fill-amber-300" />
      <path
        d="M260 38c3-4.5 6.5-4.5 10-1 3.5 3.5 7 3.5 10-1"
        fill="none"
        className="stroke-amber-800"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:py-20 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Learn the Spanish words you&apos;ll actually use.
          </h1>
          <p className="text-xl text-ink-600 dark:text-ink-400">
            Spanish vocabulary in short daily sessions, from your first words to AP and beyond.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className={`btn btn-primary min-h-14 px-7 text-lg ${focusRing}`}>
              Get started
            </Link>
            <Link href="/join" className={`btn btn-secondary min-h-14 px-7 text-lg ${focusRing}`}>
              Join a class
            </Link>
          </div>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-ink-600 dark:text-ink-400">
            <Link href="/sign-in" className={`${link} inline-flex min-h-11 items-center`}>
              Sign in
            </Link>
            <Link href="/student" className={`${link} inline-flex min-h-11 items-center`}>
              Student sign in
            </Link>
            <Link href="/teacher" className={`${link} inline-flex min-h-11 items-center`}>
              For teachers
            </Link>
          </p>
        </div>
        <div className="flex justify-center">
          <Illustration />
        </div>
      </section>

      <section className="border-t-2 border-ink-100 bg-ink-50 dark:border-ink-900 dark:bg-ink-950">
        <ul className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-12 md:grid-cols-3">
          {features.map((f) => (
            <li key={f.title} className="card flex flex-col gap-3 p-6">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-11 w-11 rounded-xl bg-brand-100 p-2 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={f.icon} />
              </svg>
              <h2 className="text-lg font-extrabold">{f.title}</h2>
              <p className="text-ink-600 dark:text-ink-400">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
