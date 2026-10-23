import Link from "next/link";
import type { ReactNode } from "react";
import { ReviewCurves } from "./_components/explainers";
import {
  Backdrop,
  CardGrid,
  CtaBand,
  Faq,
  Figure,
  InlineLink,
  Steps,
} from "./_components/marketing";
import { DemoTry } from "./_components/demo-try";
import { focusRing, link } from "./_components/styles";
import { TONES, type Tone } from "./_components/tones";
import { isDemoSite } from "@/lib/demo/config";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { demoUrl, signupsOpen } from "@/lib/site/config";
import { reviewCurves } from "@/lib/site/explainers";

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
        className="fill-orange-200 dark:fill-orange-950"
      />
      <rect
        x="58"
        y="46"
        width="250"
        height="220"
        rx="24"
        className="fill-teal-200 dark:fill-teal-950"
        transform="rotate(4 183 156)"
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
        className="fill-brand-600 dark:fill-brand-300"
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
      <circle cx="14" cy="250" r="12" className="fill-sky-400" />
      <path
        d="M300 210v24M288 222h24"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-orange-500"
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

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      {children}
    </svg>
  );
}

const facts: { tone: Tone; value: string; label: string }[] = [
  {
    tone: "violet",
    value: `${ENGINE_CONFIG.session.defaultMinutes} min`,
    label: "a day, by default",
  },
  { tone: "coral", value: String(ENGINE_CONFIG.levelBandSize), label: "words in each level" },
  { tone: "teal", value: "2", label: "memories tracked per word" },
  { tone: "sun", value: "0", label: "ads, trackers or data sold" },
];

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
    icon: (
      <Icon>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6" />
      </Icon>
    ),
    title: "A few minutes a day",
    text: "Timed sessions (15 minutes by default) mix new words with reviews. Every attentive minute counts, even if you stop early.",
  },
  {
    icon: (
      <Icon>
        <path d="M3 20h5v-5h5v-5h5V5h3" />
      </Icon>
    ),
    title: "From first words to AP and beyond",
    text: "Words come in order of how often Spanish speakers use them, in levels of 500. A 3-minute level check finds your starting point.",
  },
  {
    icon: (
      <Icon>
        <path d="M3 10l9-5 9 5-9 5-9-5z" />
        <path d="M7 12.5V17c3 2 7 2 10 0v-4.5" />
      </Icon>
    ),
    title: "Made for classrooms",
    text: "Teachers set a weekly goal and see attentive minutes, accuracy and words learned for every student.",
  },
  {
    icon: (
      <Icon>
        <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </Icon>
    ),
    title: "Private by design",
    text: "Class students join with a code and an anonymous handle. No names, no emails, no ads, no trackers.",
  },
];

/** Only asked while accounts are closed. */
const SIGN_UP_QUESTION = "When can I sign up?";

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
    q: SIGN_UP_QUESTION,
    a: "Soon. The first 500 words come next, each reviewed by hand, and accounts open when they're ready. Until then the demo shows everything working with sample words.",
  },
];

export default function Home() {
  const demo = isDemoSite(process.env);
  // Accounts open: sign-up links. Closed (the real site before opening): the demo instead.
  const open = signupsOpen(process.env);
  const demoHref = demoUrl(process.env);
  const curves = reviewCurves(60);
  return (
    <main className="flex flex-1 flex-col">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-orange-50 dark:from-brand-950/60 dark:via-ink-950 dark:to-ink-950">
        <Backdrop className="opacity-60" />
        <section className="relative mx-auto grid w-full max-w-5xl items-center gap-10 px-4 py-12 sm:py-20 md:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Learn the Spanish words you&apos;ll{" "}
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-orange-500 bg-clip-text text-transparent dark:from-brand-300 dark:via-brand-400 dark:to-orange-400">
                actually use.
              </span>
            </h1>
            <p className="text-xl text-ink-600 dark:text-ink-400">
              Short daily sessions, smart reviews that arrive just before you forget, and questions
              that grow with you, from your first words to AP and beyond.
            </p>
            {open ? (
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
                  {!demo && (
                    <a href={demoHref} className={`${link} inline-flex min-h-11 items-center`}>
                      Try the demo
                    </a>
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={demoHref}
                    className={`btn btn-primary min-h-14 px-7 text-lg ${focusRing}`}
                  >
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
                  one is reviewed by hand before it goes live. Accounts open when they&apos;re
                  ready. Already have one?{" "}
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
      </div>

      <section aria-label="At a glance" className="mx-auto w-full max-w-5xl px-4 py-10">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {facts.map((f) => (
            <div
              key={f.label}
              className={`flex flex-col rounded-2xl border-2 p-4 ${TONES[f.tone].soft}`}
            >
              <dt className={`order-2 text-sm font-semibold ${TONES[f.tone].ink}`}>{f.label}</dt>
              <dd className="order-1 text-3xl font-extrabold tracking-tight">{f.value}</dd>
            </div>
          ))}
        </dl>
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

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-14 md:grid-cols-5 md:items-center">
        <div className="flex flex-col gap-4 md:col-span-2">
          <h2 className="text-3xl font-extrabold tracking-tight">
            Reviews right before you forget
          </h2>
          <p className="text-lg text-ink-700 dark:text-ink-300">
            Every word has its own memory model. When the chance you&apos;d remember it drops to{" "}
            {Math.round(ENGINE_CONFIG.fsrs.requestRetention * 100)}%, it comes back. Each review
            makes it last longer, so you spend your minutes on the words that need them.
          </p>
          <p className="text-lg">
            <InlineLink href="/how-it-works#spaced-repetition">How the schedule works</InlineLink>
          </p>
        </div>
        <div className="min-w-0 md:col-span-3">
          <Figure tone="sun" title="One word over two months">
            <ReviewCurves
              withReviews={curves.withReviews}
              withoutReviews={curves.withoutReviews}
              reviewDays={curves.reviewDays}
              target={ENGINE_CONFIG.fsrs.requestRetention}
              height={220}
            />
          </Figure>
        </div>
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-14">
        <h2 className="text-3xl font-extrabold tracking-tight">Why it works</h2>
        <CardGrid items={pillars} />
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-14">
        <h2 className="text-3xl font-extrabold tracking-tight">Questions</h2>
        <Faq items={open ? faq.filter((f) => f.q !== SIGN_UP_QUESTION) : faq} />
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
