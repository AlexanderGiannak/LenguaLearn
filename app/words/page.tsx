import type { Metadata } from "next";
import { Suspense } from "react";
import { myWords } from "@/lib/train/learner";
import { learnerPage } from "@/lib/train/page-gate";
import { WordList } from "./word-list";

export const metadata: Metadata = { title: "My words · LenguaLearn" };

export default function WordsPage() {
  return (
    <Suspense>
      <Words />
    </Suspense>
  );
}

async function Words() {
  const u = await learnerPage("/words");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">My words</h1>
      <WordList words={await myWords(u.id)} />
    </main>
  );
}
