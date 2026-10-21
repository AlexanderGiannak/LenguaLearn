import { z } from "zod";
import { handleTraining, parse } from "@/lib/train/http";
import { startSession } from "@/lib/train/service";

const schema = z.strictObject({
  /** Whether this device can play audio (recordings or the browser's Spanish voice). */
  audio: z.boolean(),
  /** Session length. Defaults to the spec's 15 minutes; class settings set it in Phase 5. */
  minutes: z.int().min(1).max(60).optional(),
});

export async function POST(request: Request) {
  return handleTraining(request, (userId, body) => startSession(userId, parse(schema, body)));
}
