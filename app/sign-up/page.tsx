import type { Metadata } from "next";
import { isDemoSite } from "@/lib/demo/config";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account · LenguaLearn" };

export default function SignUpPage() {
  return (
    <SignUpForm
      googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)}
      demoSite={isDemoSite(process.env)}
    />
  );
}
