import { z } from "zod";
import { ageCookieHeader, ageCookieValue } from "@/lib/auth/age";
import { authBaseUrl, authSecret } from "@/lib/auth/auth";
import { handle, json, parse } from "@/lib/http/handler";

// Records "I am 13 or older" before a Google sign-up (see lib/auth/age.ts).
const schema = z.strictObject({ ageConfirmed: z.literal(true) });

export async function POST(request: Request) {
  return handle(request, { roles: "public" }, async ({ body }) => {
    parse(schema, body);
    return json({ ok: true }, 200, {
      "Set-Cookie": ageCookieHeader(
        ageCookieValue(authSecret()),
        authBaseUrl().startsWith("https://"),
      ),
    });
  });
}
