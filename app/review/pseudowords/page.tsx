import type { Metadata } from "next";
import { Suspense } from "react";
import { getDb } from "@/lib/db/client";
import { reviewerPage } from "@/lib/review/page-gate";
import { pseudowordQueue } from "@/lib/review/service";
import { PseudowordList } from "./pseudoword-list";

export const metadata: Metadata = {
  title: "Review pseudowords · LenguaLearn",
  robots: { index: false },
};

export default function PseudowordsPage() {
  return (
    <Suspense>
      <Pseudowords />
    </Suspense>
  );
}

async function Pseudowords() {
  await reviewerPage("/review/pseudowords");
  return <PseudowordList words={await pseudowordQueue(getDb())} />;
}
