import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth/session";
import { SettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "Settings · LenguaLearn" };

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const user = await currentUser(await headers());
  if (!user) redirect("/sign-in?next=/settings");
  const placeholder = user.email.endsWith(".invalid");
  return (
    <SettingsPanel
      role={user.role}
      handle={user.username ?? user.name}
      email={placeholder ? null : user.email}
      needsVerification={user.role === "teacher" && !user.emailVerified}
    />
  );
}
