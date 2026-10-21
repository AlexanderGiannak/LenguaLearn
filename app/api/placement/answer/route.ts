import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { answerPlacement } from "@/lib/train/placement";

const schema = z.strictObject({
  placementId: z.uuid(),
  token: z.string().min(1).max(64),
  yes: z.boolean(),
});

export async function POST(request: Request) {
  return handle(request, { roles: ["learner", "student"] }, async ({ user, body }) =>
    answerPlacement(user.id, parse(schema, body)),
  );
}
