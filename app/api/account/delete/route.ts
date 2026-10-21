import { verify } from "@node-rs/argon2";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { deleteAccount } from "@/lib/account/data";
import { getDb } from "@/lib/db/client";
import { account } from "@/lib/db/schema";
import { handle, HttpError, parse } from "@/lib/http/handler";

const schema = z.strictObject({
  /** The account password, or, for a Google-only account, the word DELETE. */
  confirm: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  return handle(request, { roles: ["student", "learner", "teacher"] }, async ({ user, body }) => {
    const { confirm } = parse(schema, body);
    const [credential] = await getDb()
      .select({ password: account.password })
      .from(account)
      .where(and(eq(account.userId, user.id), eq(account.providerId, "credential")));
    const ok = credential?.password
      ? await verify(credential.password, confirm)
      : confirm === "DELETE";
    if (!ok) throw new HttpError(403, "That password is not right.");
    await deleteAccount(user.id);
    return { deleted: true };
  });
}
