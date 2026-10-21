import { z } from "zod";
import { handle, parse } from "@/lib/http/handler";
import { startPlacement } from "@/lib/train/placement";

const schema = z.strictObject({
  mode: z.enum(["beginner", "test"]),
  /** The browser's time zone, for an independent learner's week. */
  timeZone: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    })
    .optional(),
});

export async function POST(request: Request) {
  return handle(request, { roles: ["learner", "student"] }, async ({ user, body }) => {
    const { mode, timeZone } = parse(schema, body);
    // Class students keep their class's week, so only learners store a time zone.
    return startPlacement(user.id, mode, user.role === "learner" ? timeZone : undefined);
  });
}
