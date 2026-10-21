import type { Metadata } from "next";
import { SignInForm } from "../sign-in/sign-in-form";

export const metadata: Metadata = { title: "Student sign in · LenguaLearn" };

// Class students sign in with handle and password only. No Google button, by design.
export default function StudentSignInPage() {
  return <SignInForm googleEnabled={false} student />;
}
