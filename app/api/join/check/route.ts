import { z } from "zod";
import { checkSeatCode } from "@/lib/auth/accounts";
import { deviceCookieHeader, requestContext } from "@/lib/auth/request";
import { handle, parse, withCookies } from "@/lib/http/handler";

const schema = z.strictObject({ code: z.string().min(1).max(20) });

export async function POST(request: Request) {
  return handle(request, { roles: "public" }, async ({ body }) => {
    const ctx = requestContext(request);
    const result = await checkSeatCode(parse(schema, body).code, ctx);
    return withCookies(
      null,
      result,
      ctx.setDeviceCookie && deviceCookieHeader(ctx.setDeviceCookie),
    );
  });
}
