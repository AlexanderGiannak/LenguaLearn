import Link from "next/link";
import type { ReactNode } from "react";
import { focusRing, link, muted } from "./styles";
import { TONES, toneAt, type Tone } from "./tones";

// Building blocks for the public pages (landing, how it works, teachers, privacy, about).
// English only: Spanish words live in the content tables, never in code.

/** Soft colored shapes behind a page header. Decorative. */
export function Backdrop({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <circle cx="350" cy="40" r="70" className="fill-orange-200/70 dark:fill-orange-500/15" />
      <circle cx="300" cy="250" r="46" className="fill-teal-200/70 dark:fill-teal-500/15" />
      <rect
        x="200"
        y="-20"
        width="80"
        height="80"
        rx="20"
        transform="rotate(18 240 20)"
        className="fill-amber-200/70 dark:fill-amber-400/10"
      />
      <circle cx="40" cy="290" r="60" className="fill-brand-200/60 dark:fill-brand-500/15" />
      <circle cx="390" cy="170" r="20" className="fill-sky-200/80 dark:fill-sky-500/15" />
    </svg>
  );
}

export function InfoPage({
  eyebrow,
  title,
  intro,
  tone = "violet",
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <header className="relative overflow-hidden border-b-2 border-ink-100 bg-gradient-to-br from-brand-50 via-white to-orange-50 dark:border-ink-900 dark:from-brand-950/60 dark:via-ink-950 dark:to-ink-950">
        <Backdrop className="opacity-70 sm:opacity-100" />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12 sm:py-16">
          <p
            className={`self-start rounded-full px-3 py-1 text-sm font-bold tracking-wide uppercase ${TONES[tone].badge}`}
          >
            {eyebrow}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <div className="text-xl text-ink-700 dark:text-ink-300">{intro}</div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 px-4 py-12">{children}</div>
    </main>
  );
}

export function Section({
  title,
  id,
  n,
  tone,
  children,
}: {
  title: string;
  id?: string;
  /** A step number, shown in a colored badge. */
  n?: number;
  tone?: Tone;
  children: ReactNode;
}) {
  const t = tone ? TONES[tone] : n ? toneAt(n - 1) : null;
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
        {n !== undefined && t && (
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${t.badge}`}
          >
            {n}
          </span>
        )}
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-lg leading-relaxed text-ink-700 dark:text-ink-300">
        {children}
      </div>
    </section>
  );
}

/** A diagram or graph in a tinted panel, with a title and a caption that says what it shows. */
export function Figure({
  title,
  caption,
  tone = "violet",
  children,
}: {
  title: string;
  caption?: ReactNode;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <figure
      className={`flex min-w-0 flex-col gap-4 rounded-3xl border-2 p-2 sm:p-6 ${TONES[tone].soft}`}
    >
      <div className="min-w-0 rounded-2xl bg-white p-3 text-base shadow-[0_2px_0_rgb(0_0_0/0.04)] sm:p-5 dark:bg-ink-900">
        <p className="mb-3 font-extrabold text-ink-900 dark:text-ink-100">{title}</p>
        {children}
      </div>
      {caption && (
        <figcaption className={`px-1 text-sm leading-relaxed ${muted}`}>{caption}</figcaption>
      )}
    </figure>
  );
}

/** A grid of small cards: a title and a sentence or two each. */
export function CardGrid({
  items,
  columns = 2,
}: {
  items: { title: string; text: ReactNode; icon?: ReactNode }[];
  columns?: 2 | 3;
}) {
  return (
    <ul className={`grid gap-4 ${columns === 3 ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
      {items.map((i, n) => (
        <li
          key={i.title}
          className={`card flex flex-col gap-2 border-t-[6px] p-5 ${toneAt(n).edge}`}
        >
          {i.icon && (
            <span
              aria-hidden="true"
              className={`mb-1 flex h-11 w-11 items-center justify-center rounded-xl ${toneAt(n).badge}`}
            >
              {i.icon}
            </span>
          )}
          <h3 className="text-lg font-extrabold text-ink-900 dark:text-ink-100">{i.title}</h3>
          <div className="text-base text-ink-600 dark:text-ink-400">{i.text}</div>
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps down the page. */
export function Steps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {items.map((s, i) => (
        <li key={s.title} className="card flex gap-4 p-5">
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${toneAt(i).badge}`}
          >
            {i + 1}
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-extrabold text-ink-900 dark:text-ink-100">{s.title}</h3>
            <div className="text-base text-ink-600 dark:text-ink-400">{s.text}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Faq({ items }: { items: { q: string; a: ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((f) => (
        <details key={f.q} className="card group">
          <summary
            className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 text-lg font-bold ${focusRing}`}
          >
            {f.q}
            <span
              aria-hidden="true"
              className="text-2xl text-brand-600 transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="px-5 pb-5 text-base leading-relaxed text-ink-600 dark:text-ink-400">
            {f.a}
          </div>
        </details>
      ))}
    </div>
  );
}

/** A closing call to action. On the real site it points at the demo. */
export function CtaBand({
  title,
  text,
  demoHref,
}: {
  title: string;
  text: string;
  demoHref: string;
}) {
  return (
    <section className="relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-white sm:p-10 dark:from-brand-800 dark:via-brand-900 dark:to-brand-950">
      <svg
        aria-hidden="true"
        viewBox="0 0 200 200"
        className="pointer-events-none absolute -top-10 -right-10 h-56 w-56 opacity-90"
      >
        <circle cx="130" cy="70" r="56" className="fill-orange-400/80" />
        <circle cx="70" cy="140" r="30" className="fill-teal-300/70" />
        <rect x="150" y="130" width="40" height="40" rx="10" className="fill-amber-300/80" />
      </svg>
      <h2 className="relative max-w-[75%] text-2xl font-extrabold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="relative max-w-xl text-lg text-brand-50">{text}</p>
      <a
        href={demoHref}
        className={`btn relative min-h-12 bg-white px-6 text-lg text-brand-800 shadow-[0_4px_0_var(--color-brand-950)] hover:bg-brand-50 ${focusRing}`}
      >
        Try the demo
      </a>
    </section>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={link}>
      {children}
    </Link>
  );
}
