import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { TRAINING_ROLES } from "@/lib/train/roles";
import { startSession } from "@/lib/train/service";

const schema = z.strictObject({
  /** Whether this device can play audio (recordings or the browser's Spanish voice). */
  audio: z.boolean(),
  /** Session length. Defaults to the spec's 15 minutes; class settings set it in Phase 5. */
  minutes: z.int().min(1).max(60).optional(),
});

export async function POST(request: Request) {
  return handle(request, { roles: TRAINING_ROLES }, ({ user, body }) =>
    startSession(user.id, parse(schema, body)),
  );
}
