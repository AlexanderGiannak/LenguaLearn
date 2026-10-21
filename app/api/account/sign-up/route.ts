import { z } from "zod";
import { signUp } from "@/lib/auth/accounts";
import { handle, parse, withCookies } from "@/lib/http/handler";

const password = z.string().min(8, "Use at least 8 characters.").max(128);
const schema = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("teacher"),
    name: z.string().trim().min(1).max(80),
    email: z.email().max(200),
    password,
  }),
  z.strictObject({
    role: z.literal("learner"),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_.-]{3,30}$/, "Use 3–30 letters, numbers, dots, dashes or underscores."),
    email: z.email().max(200).optional(),
    password,
    ageConfirmed: z.literal(true, "You must be 13 or older to make an account."),
  }),
]);

export async function POST(request: Request) {
  return handle(request, { roles: "public" }, async ({ body }) => {
    const res = await signUp(parse(schema, body));
    return withCookies(res, { ok: true });
  });
}
