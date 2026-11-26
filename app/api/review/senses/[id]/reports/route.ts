import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { markReportsReviewed } from "@/lib/review/reports";

// Marks a sense's learner reports reviewed when the content was right after all.
export async function POST(request: Request, ctx: RouteContext<"/api/review/senses/[id]/reports">) {
  return handle(request, { roles: ["teacher", "admin"] }, async ({ user, body }) => {
    const reviewer = await reviewerFor(user);
    const id = parse(z.coerce.number().int().positive().max(2_147_483_647), (await ctx.params).id);
    parse(z.strictObject({ action: z.literal("resolve") }), body);
    return markReportsReviewed(getDb(), reviewer, id);
  });
}
