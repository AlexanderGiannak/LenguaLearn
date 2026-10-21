import type { Metadata } from "next";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create an account · LenguaLearn" };

export default function SignUpPage() {
  return <SignUpForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)} />;
}
