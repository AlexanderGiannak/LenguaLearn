import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { trainingUserId } from "@/lib/train/http";
import { Trainer } from "./trainer";

export const metadata: Metadata = { title: "Training · LenguaLearn" };

export default function TrainPage() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  );
}

// Training needs a signed-in learner. Until Phase 4 that is the dev user, which exists only
// where ENABLE_DEV_USER=1; everywhere else this page is not found.
async function Gate() {
  await connection();
  if (!trainingUserId()) notFound();
  return <Trainer />;
}
