import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { link, muted } from "@/app/_components/styles";
import { getDb } from "@/lib/db/client";
import { reviewerPage } from "@/lib/review/page-gate";
import { checkCounts, queueCounts, reviewQueue } from "@/lib/review/service";
import { PublishButton } from "./publish-button";

// The review queue (spec: Content pipeline, step 4). Content only: no student data here.

export const metadata: Metadata = { title: "Review · LenguaLearn", robots: { index: false } };

const TABS = [
  { status: "ai_checked", label: "Passed the AI check", hint: "Read, then approve or fix." },
  { status: "draft", label: "Flagged", hint: "The checks found problems: fix, then approve." },
  { status: "approved", label: "Approved", hint: "Waiting for the admin to publish." },
] as const;
type Status = (typeof TABS)[number]["status"];
const PAGE = 50;

export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <Suspense>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/review">, "searchParams">) {
  const reviewer = await reviewerPage("/review");
  const q = await searchParams;
  const status: Status = TABS.some((t) => t.status === q.status)
    ? (q.status as Status)
    : "ai_checked";
  const page = Math.max(0, Math.min(10_000, Number(q.page) || 0));
  const check = typeof q.check === "string" && /^[a-z-]{1,40}$/.test(q.check) ? q.check : undefined;
  const db = getDb();
  const [counts, checks, { rows, total }] = await Promise.all([
    queueCounts(db),
    checkCounts(db, status),
    reviewQueue(db, { status, check, limit: PAGE, offset: page * PAGE }),
  ]);
  const here = (p: number) =>
    `/review?status=${status}${check ? `&check=${check}` : ""}${p ? `&page=${p}` : ""}`;
  const tab = TABS.find((t) => t.status === status)!;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Review</h1>
      <nav aria-label="Queues" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/review?status=${t.status}`}
            aria-current={t.status === status ? "page" : undefined}
            className={`btn ${t.status === status ? "btn-primary" : "btn-secondary"}`}
          >
            {t.label} ({counts[t.status]})
          </Link>
        ))}
        <Link href="/review/pseudowords" className="btn btn-secondary">
          Pseudowords
        </Link>
      </nav>
      <p className={muted}>{tab.hint}</p>
      {checks.length > 0 && (
        <nav aria-label="Filter by what the checks found" className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/review?status=${status}`}
            aria-current={!check ? "page" : undefined}
            className={`${link} ${!check ? "no-underline" : ""}`}
          >
            All
          </Link>
          {checks.map((c) => (
            <Link
              key={c.check}
              href={`/review?status=${status}&check=${c.check}`}
              aria-current={c.check === check ? "page" : undefined}
              className={`${link} ${c.check === check ? "no-underline" : ""}`}
            >
              {c.check.replace(/-/g, " ")} ({c.n})
            </Link>
          ))}
        </nav>
      )}
      {reviewer.isAdmin && <PublishButton approved={counts.approved} />}
      {rows.length === 0 ? (
        <p className={muted}>Nothing here.</p>
      ) : (
        <ul className="card divide-y-2 divide-ink-100 overflow-hidden dark:divide-ink-800">
          {rows.map((r) => (
            <li key={r.senseId}>
              <Link
                href={`/review/${r.senseId}`}
                className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 px-4 py-2 hover:bg-ink-50 dark:hover:bg-ink-900"
              >
                <span>
                  <span lang="es" className="font-semibold">
                    {r.headword}
                  </span>{" "}
                  <span className={muted}>{r.gloss}</span>
                </span>
                <span className={`text-sm ${muted}`}>
                  Level {r.level}
                  {r.failures > 0 && ` · ${r.failures} ${r.failures === 1 ? "note" : "notes"}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between">
        {page > 0 ? (
          <Link className={link} href={here(page - 1)}>
            ← Previous
          </Link>
        ) : (
          <span />
        )}
        {(page + 1) * PAGE < total && (
          <Link className={link} href={here(page + 1)}>
            Next →
          </Link>
        )}
      </div>
    </main>
  );
}
