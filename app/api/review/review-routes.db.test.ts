import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as signInRoute from "@/app/api/account/sign-in/route";
import * as signUpRoute from "@/app/api/account/sign-up/route";
import * as accountsRoute from "@/app/api/admin/accounts/route";
import { hashAdminToken } from "@/lib/admin/auth";
import { getDb, getSql } from "@/lib/db/client";
import { adminActionLog, user } from "@/lib/db/schema";
import * as decisionRoute from "./senses/[id]/decision/route";
import * as editRoute from "./senses/[id]/route";
import * as publishRoute from "./publish/route";
import * as pseudowordsRoute from "./pseudowords/route";

// The review routes' role and Origin checks, through real sign-in, and the admin API's
// reviewer grant. The service itself is tested in lib/review/service.db.test.ts.

const ORIGIN = "http://localhost:3000";
const TOKEN = "review-route-test-token-0123456789abcdef0123";
type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

async function call(
  handler: unknown,
  opts: { body?: unknown; cookie?: string; id?: string; origin?: string } = {},
) {
  const headers: Record<string, string> = {
    origin: opts.origin ?? ORIGIN,
    host: "localhost:3000",
    "content-type": "application/json",
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await (handler as Handler)(
    new Request(`${ORIGIN}/api/x`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? {}),
    }),
    { params: Promise.resolve({ id: opts.id ?? "1" }) },
  );
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, data: (await res.json()) as Record<string, unknown>, cookie };
}

function admin(body: unknown) {
  return accountsRoute.POST(
    new Request("http://localhost/api/admin/accounts", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function teacher() {
  const email = `t${randomUUID().slice(0, 8)}@example.com`;
  await call(signUpRoute.POST, {
    body: { role: "teacher", name: "Teacher", email, password: "teacher-password" },
  });
  await getDb().update(user).set({ emailVerified: true }).where(eq(user.email, email));
  const r = await call(signInRoute.POST, {
    body: { identifier: email, password: "teacher-password" },
  });
  expect(r.status).toBe(200);
  return { email, cookie: r.cookie };
}

beforeEach(() => vi.stubEnv("ADMIN_API_TOKEN_HASH", hashAdminToken(TOKEN)));
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await getSql().end();
});

const routes = [
  ["edit", editRoute.POST, {}],
  ["decision", decisionRoute.POST, { action: "approve" }],
  ["pseudowords", pseudowordsRoute.POST, { ids: [1], action: "approve" }],
  ["publish", publishRoute.POST, {}],
] as const;

describe("review routes", () => {
  it("refuse anyone who is not signed in", async () => {
    for (const [, handler, body] of routes) {
      expect((await call(handler, { body })).status).toBe(401);
    }
  });

  it("refuse teachers who are not reviewers, and learners", async () => {
    const { cookie } = await teacher();
    const learner = await call(signUpRoute.POST, {
      body: {
        role: "learner",
        username: `l${randomUUID().slice(0, 8)}`,
        password: "learner-password",
        ageConfirmed: true,
      },
    });
    for (const [, handler, body] of routes) {
      expect((await call(handler, { body, cookie })).status).toBe(403);
      expect((await call(handler, { body, cookie: learner.cookie })).status).toBe(403);
    }
  });

  it("let a granted reviewer in, except to publish, and refuse other origins", async () => {
    const { email, cookie } = await teacher();
    expect((await admin({ action: "set_reviewer", email, canReview: true })).status).toBe(200);

    // A sense that does not exist: past the role check, into the service.
    const decided = await call(decisionRoute.POST, {
      body: { action: "approve" },
      cookie,
      id: "2147483000",
    });
    expect(decided.status).toBe(404);
    expect((await call(publishRoute.POST, { cookie })).status).toBe(403);
    const crossOrigin = await call(decisionRoute.POST, {
      body: { action: "approve" },
      cookie,
      origin: "https://evil.example",
    });
    expect(crossOrigin.status).toBe(403);
    expect(
      (await call(decisionRoute.POST, { body: { action: "reject", reason: "" }, cookie })).status,
    ).toBe(400);
  });

  it("stop working the moment the grant is taken back", async () => {
    const { email, cookie } = await teacher();
    await admin({ action: "set_reviewer", email, canReview: true });
    await admin({ action: "set_reviewer", email, canReview: false });
    const r = await call(decisionRoute.POST, { body: { action: "approve" }, cookie });
    expect(r.status).toBe(403);
    const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.email, email));
    const logged = await getDb()
      .select({ action: adminActionLog.action })
      .from(adminActionLog)
      .where(eq(adminActionLog.target, u!.id));
    expect(logged.map((l) => l.action).sort()).toEqual(["grant_reviewer", "revoke_reviewer"]);
  });
});

describe("granting reviewers", () => {
  it("only grants verified teacher accounts", async () => {
    const res = await admin({
      action: "set_reviewer",
      email: "nobody@example.com",
      canReview: true,
    });
    expect(res.status).toBe(409);
    const email = `u${randomUUID().slice(0, 8)}@example.com`;
    await call(signUpRoute.POST, {
      body: { role: "teacher", name: "Teacher", email, password: "teacher-password" },
    });
    const unverified = await admin({ action: "set_reviewer", email, canReview: true });
    expect(await unverified.json()).toEqual({
      error: "the teacher has not confirmed their email",
    });
  });
});
