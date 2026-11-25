import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { senseEditSchema } from "@/lib/review/schema";
import { editSense } from "@/lib/review/service";

// Saves a reviewer's edit of one sense (lib/review/service.ts).
export async function POST(request: Request, ctx: RouteContext<"/api/review/senses/[id]">) {
  return handle(request, { roles: ["teacher", "admin"] }, async ({ user, body }) => {
    const reviewer = await reviewerFor(user);
    const id = parse(z.coerce.number().int().positive().max(2_147_483_647), (await ctx.params).id);
    return editSense(getDb(), reviewer, id, parse(senseEditSchema, body));
  });
}
