import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { TRAINING_ROLES } from "@/lib/train/roles";
import { endSession } from "@/lib/train/service";

const schema = z.strictObject({
  sessionId: z.uuid(),
  /** Visible time since the last answer; capped on the server like any screen. */
  activeMs: z.int().min(0).max(3_600_000).optional(),
});

export async function POST(request: Request) {
  return handle(request, { roles: TRAINING_ROLES }, ({ user, body }) => {
    const { sessionId, activeMs } = parse(schema, body);
    return endSession(user.id, sessionId, activeMs);
  });
}
