import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth/session";
import { TRAINING_ROLES } from "@/lib/train/roles";
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
  const user = await currentUser(await headers());
  if (!user || !(TRAINING_ROLES as readonly string[]).includes(user.role)) {
    redirect("/sign-in?next=/train");
  }
  return <Trainer />;
}
