import { getDb } from "@/lib/db/client";
import { handle } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { publishApproved } from "@/lib/review/service";

// The admin moves every approved row to live (reviewers cannot: owner, 2026-11-25).
export async function POST(request: Request) {
  return handle(request, { roles: ["admin"] }, async ({ user }) =>
    publishApproved(getDb(), await reviewerFor(user)),
  );
}
