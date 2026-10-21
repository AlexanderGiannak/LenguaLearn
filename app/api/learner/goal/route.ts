import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { learnerProfile } from "@/lib/db/schema";
import { handle, parse } from "@/lib/http/handler";
import { getProfile } from "@/lib/train/store";

// Independent learners set their own weekly goal (spec: Student experience).
const schema = z.strictObject({ minutes: z.int().min(5).max(2000) });

export async function POST(request: Request) {
  return handle(request, { roles: ["learner"] }, async ({ user, body }) => {
    const { minutes } = parse(schema, body);
    await getProfile(getDb(), user.id);
    await getDb()
      .update(learnerProfile)
      .set({ weeklyGoalMinutes: minutes })
      .where(eq(learnerProfile.userId, user.id));
    return { ok: true };
  });
}
