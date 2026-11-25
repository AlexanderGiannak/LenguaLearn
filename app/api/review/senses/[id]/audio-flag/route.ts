import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { handle, parse } from "@/lib/http/handler";
import { reviewerFor } from "@/lib/review/access";
import { flagAudioSchema } from "@/lib/review/schema";
import { flagAudio } from "@/lib/review/service";

// Flags a wrong pronunciation: the recording is retired and made again by content:audio.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/review/senses/[id]/audio-flag">,
) {
  return handle(request, { roles: ["teacher", "admin"] }, async ({ user, body }) => {
    const reviewer = await reviewerFor(user);
    const id = parse(z.coerce.number().int().positive().max(2_147_483_647), (await ctx.params).id);
    const f = parse(flagAudioSchema, body);
    return flagAudio(getDb(), reviewer, id, f.target, f.reason);
  });
}
