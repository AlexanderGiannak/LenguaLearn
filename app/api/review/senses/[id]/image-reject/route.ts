import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { rejectImageSchema } from "@/lib/review/schema";
import { rejectImage } from "@/lib/review/service";

// Rejects a picture: it is retired and content:images finds or makes another.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/review/senses/[id]/image-reject">,
) {
  return handle(request, { roles: ["teacher", "admin"] }, async ({ user, body }) => {
    const reviewer = await reviewerFor(user);
    const id = parse(z.coerce.number().int().positive().max(2_147_483_647), (await ctx.params).id);
    const { reason } = parse(rejectImageSchema, body);
    return rejectImage(getDb(), reviewer, id, reason);
  });
}
