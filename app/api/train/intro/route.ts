import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { TRAINING_ROLES } from "@/lib/train/roles";
import { chooseIntro } from "@/lib/train/service";

const schema = z.strictObject({
  questionId: z.uuid(),
  choice: z.enum(["got_it", "already_know"]),
  activeMs: z.int().min(0).max(3_600_000),
  feedbackMs: z.int().min(0).max(3_600_000).optional(),
});

export async function POST(request: Request) {
  return handle(request, { roles: TRAINING_ROLES }, ({ user, body }) =>
    chooseIntro(user.id, parse(schema, body)),
  );
}
