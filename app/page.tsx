import Link from "next/link";
import { CardGrid, CtaBand, Faq, InlineLink, Steps } from "./_components/marketing";
import { DemoTry } from "./_components/demo-try";
import { focusRing, link } from "./_components/styles";
import { isDemoSite } from "@/lib/demo/config";
import { demoUrl } from "@/lib/site/config";

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

const session = [
  {
    title: "Meet a new word",
    text: "A word page with the meaning in English, a short definition, example sentences with audio, and related words. Some concrete words get a picture too.",
  },
  {
    title: "Check it right away",
    text: "A quick question follows straight away, and the word comes back a few questions later in a different form.",
  },
  {
    title: "Reviews arrive just in time",
    text: "The app predicts when you're about to forget each word and brings it back right then: not too early, not too late.",
  },
  {
    title: "Questions get harder as you learn",
    text: "First you recognize the word, then pick it, then use it in a sentence, and finally type it from memory.",
  },
];

const pillars = [
  {
    title: "A few minutes a day",
    text: "Timed sessions (15 minutes by default) mix new words with reviews. Every attentive minute counts, even if you stop early.",
  },
  {
    title: "From first words to AP and beyond",
    text: "Words come in order of how often Spanish speakers use them, in levels of 500. A 3-minute level check finds your starting point.",
  },
  {
    title: "Made for classrooms",
    text: "Teachers set a weekly goal and see attentive minutes, accuracy and words learned for every student.",
  },
  {
    title: "Private by design",
    text: "Class students join with a code and an anonymous handle. No names, no emails, no ads, no trackers.",
  },
];

const faq = [
  {
    q: "Is it really free?",
    a: "Yes. LenguaLearn is free for learners and teachers, with no ads and no selling data. It runs on a small budget on purpose.",
  },
  {
    q: "Who is it for?",
    a: "English speakers learning Spanish: independent learners aged 13 and up, and Spanish classes from first year through AP and college.",
  },
  {
    q: "How much time does it take?",
    a: "Sessions are 15 minutes by default, and teachers can change that. Learning comes from showing up most days, so a short session every day beats a long one once a week.",
  },
  {
    q: "Where do the words come from?",
    a: (
      <>
        Each word page is drafted with AI and checked field by field by a second, independent AI.
        Then a person reviews and approves it: nothing reaches a student before that. See{" "}
        <InlineLink href="/about#content">how content is made</InlineLink>.
      </>
    ),
  },
  {
    q: "Does it work on Chromebooks and phones?",
    a: "Yes. It's a web app built and tested at Chromebook and phone sizes, and every action works by keyboard and by touch.",
  },
  {
    q: "When can I sign up?",
    a: "Soon. The first 500 words come next, each reviewed by hand, and accounts open when they're ready. Until then the demo shows everything working with sample words.",
  },
];

export default function Home() {
  const demo = isDemoSite(process.env);
  const demoHref = demoUrl(process.env);
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:py-20 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Learn the Spanish words you&apos;ll actually use.
          </h1>
          <p className="text-xl text-ink-600 dark:text-ink-400">
            Short daily sessions, smart reviews that arrive just before you forget, and questions
            that grow with you, from your first words to AP and beyond.
          </p>
          {demo ? (
            <>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/sign-up"
                  className={`btn btn-primary min-h-14 px-7 text-lg ${focusRing}`}
                >
                  Get started
                </Link>
                <Link
                  href="/join"
                  className={`btn btn-secondary min-h-14 px-7 text-lg ${focusRing}`}
                >
                  Join a class
                </Link>
              </div>
              <p className="flex flex-wrap gap-x-5 gap-y-1">
                <Link href="/sign-in" className={`${link} inline-flex min-h-11 items-center`}>
                  Sign in
                </Link>
                <Link href="/student" className={`${link} inline-flex min-h-11 items-center`}>
                  Student sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-3">
                <a href={demoHref} className={`btn btn-primary min-h-14 px-7 text-lg ${focusRing}`}>
                  Try the demo
                </a>
                <Link
                  href="/how-it-works"
                  className={`btn btn-secondary min-h-14 px-7 text-lg ${focusRing}`}
                >
                  How it works
                </Link>
              </div>
              <p className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-4 text-brand-950 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-100">
                <strong>Opening soon.</strong> We&apos;re preparing the first 500 words, and each
                one is reviewed by hand before it goes live. Accounts open when they&apos;re ready.
                Already have one?{" "}
                <Link href="/sign-in" className={link}>
                  Sign in
                </Link>
                .
              </p>
            </>
          )}
        </div>
        <div className="flex justify-center">
          <Illustration />
        </div>
        {demo && (
          <div className="md:col-span-2">
            <DemoTry />
          </div>
        )}
      </section>

      <section className="border-y-2 border-ink-100 bg-ink-50 dark:border-ink-900 dark:bg-ink-950">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-14">
          <h2 className="text-3xl font-extrabold tracking-tight">A session, step by step</h2>
          <Steps items={session} />
          <p className="text-lg">
            <InlineLink href="/how-it-works">See the learning method in detail</InlineLink>
          </p>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-14">
        <h2 className="text-3xl font-extrabold tracking-tight">Why it works</h2>
        <CardGrid items={pillars} />
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-14">
        <h2 className="text-3xl font-extrabold tracking-tight">Questions</h2>
        <Faq items={faq} />
      </section>

      {!demo && (
        <div className="mx-auto w-full max-w-5xl px-4 pb-16">
          <CtaBand
            title="See it working"
            text="The demo runs the real app with sample words: train as a learner, or open a teacher dashboard with a class of 25 students."
            demoHref={demoHref}
          />
        </div>
      )}
    </main>
  );
}
