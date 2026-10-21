import { z } from "zod";
import { handleTraining, parse } from "@/lib/train/http";
import { endSession } from "@/lib/train/service";

const schema = z.strictObject({
  sessionId: z.uuid(),
  /** Visible time since the last answer; capped on the server like any screen. */
  activeMs: z.int().min(0).max(3_600_000).optional(),
});

export async function POST(request: Request) {
  return handleTraining(request, (userId, body) => {
    const { sessionId, activeMs } = parse(schema, body);
    return endSession(userId, sessionId, activeMs);
  });
}
