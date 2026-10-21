import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { needsPlacement } from "@/lib/train/placement";
import { learnerPage } from "@/lib/train/page-gate";
import { PlacementFlow } from "./placement-flow";

export const metadata: Metadata = { title: "Find your level · LenguaLearn" };

export default function PlacementPage() {
  return (
    <Suspense>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const u = await learnerPage("/placement", { allowUnplaced: true });
  if (!(await needsPlacement(u.id, u.role))) redirect("/home");
  return <PlacementFlow />;
}
