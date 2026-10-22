import Link from "next/link";
import type { ReactNode } from "react";
import { focusRing, link } from "./styles";

// Building blocks for the public pages (landing, how it works, teachers, privacy, about).
// English only: Spanish words live in the content tables, never in code.

export function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b-2 border-ink-100 bg-ink-50 dark:border-ink-900 dark:bg-ink-950">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-12 sm:py-16">
          <p className="text-sm font-bold tracking-wide text-brand-700 uppercase dark:text-brand-300">
            {eyebrow}
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <div className="text-xl text-ink-600 dark:text-ink-400">{intro}</div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-14 px-4 py-12">{children}</div>
    </main>
  );
}

export function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-4 text-lg leading-relaxed text-ink-700 dark:text-ink-300">
        {children}
      </div>
    </section>
  );
}

/** A grid of small cards: a title and a sentence or two each. */
export function CardGrid({
  items,
  columns = 2,
}: {
  items: { title: string; text: ReactNode }[];
  columns?: 2 | 3;
}) {
  return (
    <ul className={`grid gap-4 ${columns === 3 ? "md:grid-cols-3" : "sm:grid-cols-2"}`}>
      {items.map((i) => (
        <li key={i.title} className="card flex flex-col gap-2 p-5">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-extrabold text-brand-800 dark:bg-brand-950 dark:text-brand-200"
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
    <section className="flex flex-col items-start gap-4 rounded-3xl bg-brand-600 p-8 text-white dark:bg-brand-900">
      <h2 className="text-2xl font-extrabold tracking-tight">{title}</h2>
      <p className="text-lg text-brand-50">{text}</p>
      <a
        href={demoHref}
        className={`btn min-h-12 bg-white px-6 text-lg text-brand-800 shadow-[0_4px_0_var(--color-brand-900)] hover:bg-brand-50 ${focusRing}`}
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
