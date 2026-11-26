import type { Metadata } from "next";
import { Suspense } from "react";
import { reportTextAllowed } from "@/lib/review/report-reasons";
import { learnerPage } from "@/lib/train/page-gate";
import { Trainer } from "./trainer";

export const metadata: Metadata = { title: "Training · LenguaLearn" };

export default function TrainPage() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  // Learners and class students place first (spec: Placement); teachers may try training.
  const u = await learnerPage("/train");
  return <Trainer reportText={reportTextAllowed(u.role)} />;
}
