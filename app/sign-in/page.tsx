import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · LenguaLearn" };

export default function SignInPage() {
  return <SignInForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} student={false} />;
}
