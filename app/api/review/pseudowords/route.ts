import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { pseudowordDecisionSchema } from "@/lib/review/schema";
import { decidePseudowords } from "@/lib/review/service";

// Approves placement pseudowords, or rejects (retires) them.
export async function POST(request: Request) {
  return handle(request, { roles: ["teacher", "admin"] }, async ({ user, body }) => {
    const reviewer = await reviewerFor(user);
    const d = parse(pseudowordDecisionSchema, body);
    return decidePseudowords(getDb(), reviewer, d.ids, d.action);
  });
}
