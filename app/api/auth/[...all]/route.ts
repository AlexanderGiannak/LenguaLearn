import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/auth";

// Better Auth's remaining endpoints: session, sign-out, Google sign-in, email verification,
// password reset and change. Sign-up and sign-in go through /api/account instead.
// Built on first request so `next build` needs no database.

export async function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
