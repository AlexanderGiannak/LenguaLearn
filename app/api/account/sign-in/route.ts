import { z } from "zod";
import { signIn } from "@/lib/auth/accounts";
import { deviceCookieHeader, requestContext } from "@/lib/auth/request";
import { handle, parse, withCookies } from "@/lib/http/handler";

const schema = z.strictObject({
  /** An email, a username, or a class student's handle. */
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  return handle(request, { roles: "public" }, async ({ body }) => {
    const ctx = requestContext(request);
    const res = await signIn(parse(schema, body), ctx);
    return withCookies(
      res,
      { ok: true },
      ctx.setDeviceCookie && deviceCookieHeader(ctx.setDeviceCookie),
    );
  });
}
