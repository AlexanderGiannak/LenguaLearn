import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { decisionSchema } from "@/lib/review/schema";
import { approveSense, rejectSense } from "@/lib/review/service";

// Approves a sense or sends it back to draft with a reason.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/review/senses/[id]/decision">,
) {
  return handle(request, { roles: ["teacher", "admin"] }, async ({ user, body }) => {
    const reviewer = await reviewerFor(user);
    const id = parse(z.coerce.number().int().positive().max(2_147_483_647), (await ctx.params).id);
    const d = parse(decisionSchema, body);
    return d.action === "approve"
      ? approveSense(getDb(), reviewer, id)
      : rejectSense(getDb(), reviewer, id, d.reason);
  });
}
