import type { Metadata } from "next";
import { JoinFlow } from "./join-flow";

export const metadata: Metadata = { title: "Join a class · LenguaLearn" };

export default function JoinPage() {
  return <JoinFlow />;
}
