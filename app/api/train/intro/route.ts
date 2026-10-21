import { z } from "zod";
import { handleTraining, parse } from "@/lib/train/http";
import { chooseIntro } from "@/lib/train/service";

const schema = z.strictObject({
  questionId: z.uuid(),
  choice: z.enum(["got_it", "already_know"]),
  activeMs: z.int().min(0).max(3_600_000),
});

export async function POST(request: Request) {
  return handleTraining(request, (userId, body) => chooseIntro(userId, parse(schema, body)));
}
