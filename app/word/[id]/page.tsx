import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLiveWordPage } from "@/lib/content/word-page";
import { WordView } from "./word-view";

// Read-only word page (spec: Word page). Only live content is shown; anything else gets
// the not-found page. With Cache Components the static shell streams before the data
// loads, so in production that page arrives with status 200 and a noindex tag rather than
// a 404 status (docs: "Status codes" under loading.js).

const MAX_ID = 2_147_483_647; // Postgres integer

export default function WordPage({ params }: PageProps<"/word/[id]">) {
  return (
    <Suspense fallback={<WordSkeleton />}>
      <Word params={params} />
    </Suspense>
  );
}

async function Word({ params }: Pick<PageProps<"/word/[id]">, "params">) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > MAX_ID) notFound();

  await connection();
  const word = await getLiveWordPage(Number(id));
  if (!word) notFound();

  return <WordView word={word} />;
}

function WordSkeleton() {
  const bar = "rounded bg-zinc-100 dark:bg-zinc-900";
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <div className={`h-10 w-48 ${bar}`} />
      <div className={`mt-3 h-5 w-36 ${bar}`} />
      <div className={`mt-10 h-24 w-full ${bar}`} />
    </main>
  );
}
