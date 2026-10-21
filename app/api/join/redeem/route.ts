import { z } from "zod";
import { redeemJoinCode, redeemResetCode } from "@/lib/auth/accounts";
import { deviceCookieHeader, requestContext } from "@/lib/auth/request";
import { handle, HttpError, parse, withCookies } from "@/lib/http/handler";

const schema = z.strictObject({
  code: z.string().min(1).max(20),
  kind: z.enum(["join", "reset"]),
  password: z.string().min(8, "Use at least 8 characters.").max(128).optional(),
});

export async function POST(request: Request) {
  return handle(request, { roles: "public" }, async ({ user, body, setCookie }) => {
    const ctx = requestContext(request);
    // Set on failures too, so failed attempts from a new browser share one device ID.
    if (ctx.setDeviceCookie) setCookie(deviceCookieHeader(ctx.setDeviceCookie));
    const input = parse(schema, body);
    if (input.kind === "reset") {
      if (!input.password) throw new HttpError(400, "Choose a new password.");
      const r = await redeemResetCode({ code: input.code, password: input.password }, ctx);
      return withCookies(r.response, { handle: r.handle });
    }
    const r = await redeemJoinCode({ code: input.code, password: input.password }, user, ctx);
    return withCookies(r.response, { handle: r.handle });
  });
}
