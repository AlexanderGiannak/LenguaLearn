import { eq } from "drizzle-orm";
import { isPlaceholderEmail } from "@/lib/auth/identifiers";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { handle, HttpError } from "@/lib/http/handler";

// For people who signed up with Google (everyone starts as a learner): switch to a teacher
// account. Teachers need a real, verified email, so username-only accounts can't switch.
export async function POST(request: Request) {
  return handle(request, { roles: ["learner"] }, async ({ user: u }) => {
    if (isPlaceholderEmail(u.email)) {
      throw new HttpError(
        403,
        "Teacher accounts need an email address. Create one with your school email.",
      );
    }
    await getDb().update(user).set({ role: "teacher" }).where(eq(user.id, u.id));
    return { role: "teacher" };
  });
}
