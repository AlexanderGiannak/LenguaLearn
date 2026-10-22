import { after } from "next/server";
import { z } from "zod";
import { deviceCookieHeader, requestContext } from "@/lib/auth/request";
import { RateLimiter } from "@/lib/auth/rate-limit";
import { DEMO_CONFIG, isDemoSite } from "@/lib/demo/config";
import {
  cleanupDemoAccounts,
  refillTeacherPool,
  startDemoLearner,
  startDemoTeacher,
} from "@/lib/demo/service";
import { handle, HttpError, json, parse, withCookies } from "@/lib/http/handler";

// The demo site's "Try it" buttons. Demo mode only; everywhere else this route is a 404.

const schema = z.discriminatedUnion("role", [
  // Spec: independent learners confirm they are 13 or older, demo or not.
  z.strictObject({
    role: z.literal("learner"),
    ageConfirmed: z.literal(true, "You must be 13 or older to try it."),
  }),
  z.strictObject({ role: z.literal("teacher") }),
]);

const HOUR = 3_600_000;
const limiter = new RateLimiter();

export async function POST(request: Request) {
  if (!isDemoSite(process.env)) return json({ error: "not found" }, 404);
  return handle(request, { roles: "public" }, async ({ body, setCookie }) => {
    const input = parse(schema, body);
    const ctx = requestContext(request);
    if (ctx.setDeviceCookie) setCookie(deviceCookieHeader(ctx.setDeviceCookie));
    const { limits } = DEMO_CONFIG;
    const siteWide = input.role === "teacher" ? limits.teachersSiteWide : limits.learnersSiteWide;
    if (
      !limiter.check(`device:${ctx.device}`, limits.perDevice, HOUR).allowed ||
      !limiter.check(`site:${input.role}`, siteWide, HOUR).allowed
    ) {
      throw new HttpError(429, "The demo is busy. Try again in a little while.");
    }
    limiter.record(`device:${ctx.device}`, HOUR);
    limiter.record(`site:${input.role}`, HOUR);

    const res = input.role === "teacher" ? await startDemoTeacher() : await startDemoLearner();
    // Housekeeping after the visitor has their reply: expire old demos, rebuild the pool.
    after(async () => {
      await cleanupDemoAccounts();
      await refillTeacherPool();
    });
    return withCookies(res, { next: input.role === "teacher" ? "/teacher" : "/placement" });
  });
}
