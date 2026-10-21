import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as signInRoute from "@/app/api/account/sign-in/route";
import * as signUpRoute from "@/app/api/account/sign-up/route";
import * as exportRoute from "@/app/api/account/export/route";
import * as deleteRoute from "@/app/api/account/delete/route";
import * as joinCheck from "@/app/api/join/check/route";
import * as joinRedeem from "@/app/api/join/redeem/route";
import * as classesRoute from "@/app/api/teacher/classes/route";
import * as classRoute from "@/app/api/teacher/classes/[id]/route";
import * as seatsRoute from "@/app/api/teacher/classes/[id]/seats/route";
import * as csvRoute from "@/app/api/teacher/classes/[id]/csv/route";
import * as seatRoute from "@/app/api/teacher/seats/[id]/route";
import * as resetRoute from "@/app/api/teacher/seats/[id]/reset/route";
import * as trainStart from "@/app/api/train/start/route";
import { getDb, getSql } from "@/lib/db/client";
import { adminActionLog, seat, user } from "@/lib/db/schema";
import { purgeScheduledDeletions } from "@/lib/teacher/scope";

// End-to-end account flows through the real route handlers, plus the spec's authorization
// tests: teacher A can never reach teacher B's class through any API route.

const ORIGIN = "http://localhost:3000";
type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

async function call(
  handler: Handler | ((req: Request) => Promise<Response>),
  opts: { method?: string; body?: unknown; cookie?: string; ip?: string; id?: string } = {},
) {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { origin: ORIGIN, host: "localhost:3000" };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const req = new Request(`${ORIGIN}/api/x`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const res = await (handler as Handler)(req, { params: Promise.resolve({ id: opts.id ?? "" }) });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const text = await res.text();
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // CSV and other non-JSON bodies stay text.
  }
  return { status: res.status, data: data as Record<string, unknown>, cookie };
}

const uniq = () => randomUUID().slice(0, 8);

async function teacher() {
  const email = `t${uniq()}@example.com`;
  await call(signUpRoute.POST, {
    body: { role: "teacher", name: "Teacher", email, password: "teacher-password" },
  });
  // Spec: teachers verify their email before using teacher features.
  await getDb().update(user).set({ emailVerified: true }).where(eq(user.email, email));
  const r = await call(signInRoute.POST, {
    body: { identifier: email, password: "teacher-password" },
  });
  expect(r.status).toBe(200);
  return r.cookie;
}

async function learner() {
  const username = `l${uniq()}`;
  const r = await call(signUpRoute.POST, {
    body: { role: "learner", username, password: "learner-password", ageConfirmed: true },
  });
  expect(r.status).toBe(200);
  return { cookie: r.cookie, username };
}

async function classWithSeats(cookie: string, seats = 3) {
  const created = await call(classesRoute.POST, { cookie, body: { name: "Spanish 1", seats } });
  expect(created.status).toBe(200);
  const id = created.data.id as string;
  const detail = await call(classRoute.GET, { cookie, id });
  return {
    id,
    seats: detail.data.seats as { id: string; code: string | null; handle: string | null }[],
  };
}

async function join(code: string, cookie?: string) {
  return call(joinRedeem.POST, {
    cookie,
    body: { code, kind: "join", password: "student-password" },
  });
}

beforeEach(() => {
  // Each test file shares one in-memory limiter; fresh limits keep tests independent.
  (globalThis as { authLimits?: unknown }).authLimits = undefined;
});

afterAll(async () => {
  await getSql().end();
});

describe("authorization: teacher routes", () => {
  it("teacher A cannot read or change teacher B's class through any route", async () => {
    const a = await teacher();
    const b = await teacher();
    const { id, seats } = await classWithSeats(a);
    const seatId = seats[0]!.id;

    const attempts: [string, Awaited<ReturnType<typeof call>>][] = [
      ["GET class", await call(classRoute.GET, { cookie: b, id })],
      ["DELETE class", await call(classRoute.DELETE, { cookie: b, id, method: "DELETE" })],
      ["POST seats", await call(seatsRoute.POST, { cookie: b, id, body: { count: 1 } })],
      ["GET csv", await call(csvRoute.GET, { cookie: b, id })],
      ["POST reset", await call(resetRoute.POST, { cookie: b, id: seatId, body: {} })],
      ["DELETE seat", await call(seatRoute.DELETE, { cookie: b, id: seatId, method: "DELETE" })],
    ];
    for (const [label, r] of attempts) expect([label, r.status]).toEqual([label, 404]);

    const list = await call(classesRoute.GET, { cookie: b });
    expect(list.data.classes).toEqual([]);
    // And A's class is untouched.
    expect((await call(classRoute.GET, { cookie: a, id })).data.seats).toHaveLength(3);
  });

  it("refuses students, learners and visitors on every teacher route", async () => {
    const a = await teacher();
    const { id, seats } = await classWithSeats(a);
    const student = (await join(seats[0]!.code!)).cookie;
    const { cookie: learnerCookie } = await learner();
    for (const [who, cookie, expected] of [
      ["student", student, 403],
      ["learner", learnerCookie, 403],
      ["visitor", undefined, 401],
    ] as const) {
      for (const r of [
        await call(classesRoute.GET, { cookie }),
        await call(classesRoute.POST, { cookie, body: { name: "x", seats: 1 } }),
        await call(classRoute.GET, { cookie, id }),
        await call(csvRoute.GET, { cookie, id }),
        await call(resetRoute.POST, { cookie, id: seats[1]!.id, body: {} }),
      ]) {
        expect([who, r.status]).toEqual([who, expected]);
      }
    }
  });

  it("refuses a teacher whose email is not verified", async () => {
    const email = `t${uniq()}@example.com`;
    await call(signUpRoute.POST, {
      body: { role: "teacher", name: "T", email, password: "teacher-password" },
    });
    const r = await call(signInRoute.POST, {
      body: { identifier: email, password: "teacher-password" },
    });
    expect((await call(classesRoute.GET, { cookie: r.cookie })).status).toBe(403);
  });

  it("refuses cross-site requests that would change state", async () => {
    const a = await teacher();
    const req = new Request(`${ORIGIN}/api/teacher/classes`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "localhost:3000",
        cookie: a,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "x", seats: 1 }),
    });
    expect((await classesRoute.POST(req)).status).toBe(403);
  });
});

describe("class students", () => {
  it("join with a seat code and get a random handle, with no personal data", async () => {
    const { id, seats } = await classWithSeats(await teacher());
    const code = seats[0]!.code!;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const check = await call(joinCheck.POST, { body: { code: code.toLowerCase() } });
    expect(check.data).toEqual({ kind: "join", className: "Spanish 1" });

    const joined = await join(code);
    expect(joined.status).toBe(200);
    const handle = joined.data.handle as string;
    expect(handle).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);

    const [row] = await getDb().select().from(user).where(eq(user.username, handle));
    expect(row).toMatchObject({ role: "student", name: handle, image: null });
    expect(row!.email).toMatch(/@students\.invalid$/);

    // The code is spent.
    expect((await join(code)).status).toBe(404);
    const [s] = await getDb().select().from(seat).where(eq(seat.id, seats[0]!.id));
    expect(s).toMatchObject({ studentId: row!.id, code: null });

    // And they can sign in with handle and password.
    const signIn = await call(signInRoute.POST, {
      body: { identifier: handle, password: "student-password" },
    });
    expect(signIn.status).toBe(200);
    expect((await call(classRoute.GET, { cookie: signIn.cookie, id })).status).toBe(403);
  });

  it("can train once joined", async () => {
    const { seats } = await classWithSeats(await teacher());
    const joined = await join(seats[0]!.code!);
    const res = await call(trainStart.POST, { cookie: joined.cookie, body: { audio: false } });
    expect(res.status).toBe(200);
  });

  it("change classes by redeeming another code while signed in, keeping one account", async () => {
    const first = await classWithSeats(await teacher());
    const second = await classWithSeats(await teacher());
    const joined = await join(first.seats[0]!.code!);
    const again = await call(joinRedeem.POST, {
      cookie: joined.cookie,
      body: { code: second.seats[0]!.code!, kind: "join" },
    });
    expect(again.status).toBe(200);
    expect(again.data.handle).toBe(joined.data.handle);
    const studentIds = await getDb()
      .select({ id: seat.studentId })
      .from(seat)
      .where(
        eq(
          seat.studentId,
          (
            await getDb()
              .select()
              .from(user)
              .where(eq(user.username, joined.data.handle as string))
          )[0]!.id,
        ),
      );
    expect(studentIds).toHaveLength(2);
  });

  it("refuses a seat code from a signed-in teacher or learner (their account has a real name)", async () => {
    const { seats } = await classWithSeats(await teacher());
    const { cookie } = await learner();
    const r = await call(joinRedeem.POST, {
      cookie,
      body: { code: seats[0]!.code!, kind: "join" },
    });
    expect(r.status).toBe(403);
  });

  it("reset: the teacher's reset code lets the student set a new password and keep progress", async () => {
    const t = await teacher();
    const { id, seats } = await classWithSeats(t);
    const joined = await join(seats[0]!.code!);
    const handle = joined.data.handle as string;

    const reset = await call(resetRoute.POST, { cookie: t, id: seats[0]!.id, body: {} });
    expect(reset.data.kind).toBe("reset");
    const redeemed = await call(joinRedeem.POST, {
      body: { code: reset.data.code, kind: "reset", password: "brand-new-password" },
    });
    expect(redeemed.status).toBe(200);
    expect(redeemed.data.handle).toBe(handle);

    expect(
      (await call(signInRoute.POST, { body: { identifier: handle, password: "student-password" } }))
        .status,
    ).toBe(401);
    expect(
      (
        await call(signInRoute.POST, {
          body: { identifier: handle, password: "brand-new-password" },
        })
      ).status,
    ).toBe(200);
    // Still the same seat.
    const detail = await call(classRoute.GET, { cookie: t, id });
    expect((detail.data.seats as { handle: string }[])[0]!.handle).toBe(handle);
  });

  it("the CSV has seat, code and a blank name column, and never a name", async () => {
    const t = await teacher();
    const { id } = await classWithSeats(t, 2);
    const csv = await call(csvRoute.GET, { cookie: t, id });
    const lines = (csv.data as unknown as string).trim().split("\n");
    expect(lines[0]).toBe("seat,code,student name");
    expect(lines[1]).toMatch(/^1,[A-Z2-9]{4}-[A-Z2-9]{4},$/);
  });
});

describe("rate limits", () => {
  it("lets 30 students log in from one school IP within a minute", async () => {
    const { seats } = await classWithSeats(await teacher(), 30);
    const handles: string[] = [];
    for (const s of seats) handles.push((await join(s.code!)).data.handle as string);
    for (const handle of handles) {
      const r = await call(signInRoute.POST, {
        ip: "203.0.113.50",
        body: { identifier: handle, password: "student-password" },
      });
      expect(r.status).toBe(200);
    }
  }, 60_000);

  it("stops password guessing at one handle", async () => {
    const { seats } = await classWithSeats(await teacher(), 1);
    const handle = (await join(seats[0]!.code!)).data.handle as string;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (
          await call(signInRoute.POST, {
            ip: `198.51.100.${i}`,
            body: { identifier: handle, password: "wrong-guess" },
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("device limits", () => {
  it("sets the device cookie on a failed sign-in, so failures from one browser add up", async () => {
    const first = await call(signInRoute.POST, {
      ip: "198.51.100.200",
      body: { identifier: "nobody-here", password: "wrong-guess" },
    });
    expect(first.status).toBe(401);
    expect(first.cookie).toMatch(/^ll_device=/);
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      statuses.push(
        (
          await call(signInRoute.POST, {
            cookie: first.cookie,
            ip: `198.51.100.${i}`,
            body: { identifier: `spray-${i}`, password: "wrong-guess" },
          })
        ).status,
      );
    }
    // 1 + 29 failures are allowed; the 31st attempt from this browser is refused.
    expect(statuses.slice(0, 29).every((s) => s === 401)).toBe(true);
    expect(statuses[29]).toBe(429);
  });
});

describe("unverified teachers", () => {
  it("can still export and delete their own data", async () => {
    const email = `t${uniq()}@example.com`;
    await call(signUpRoute.POST, {
      body: { role: "teacher", name: "T", email, password: "teacher-password" },
    });
    const r = await call(signInRoute.POST, {
      body: { identifier: email, password: "teacher-password" },
    });
    expect((await call(exportRoute.GET, { cookie: r.cookie })).status).toBe(200);
    expect(
      (await call(deleteRoute.POST, { cookie: r.cookie, body: { confirm: "teacher-password" } }))
        .status,
    ).toBe(200);
  });
});

describe("deletion and export", () => {
  it("a student can export their data, which holds no email", async () => {
    const { seats } = await classWithSeats(await teacher());
    const joined = await join(seats[0]!.code!);
    const exported = await call(exportRoute.GET, { cookie: joined.cookie });
    expect(exported.status).toBe(200);
    expect(exported.data.account).toMatchObject({
      handleOrUsername: joined.data.handle,
      email: null,
    });
    expect(exported.data.classes).toEqual([
      expect.objectContaining({ className: "Spanish 1", seatNumber: 1 }),
    ]);
  });

  it("deleting an account needs the password and removes the user", async () => {
    const { cookie, username } = await learner();
    expect((await call(deleteRoute.POST, { cookie, body: { confirm: "wrong" } })).status).toBe(403);
    expect(
      (await call(deleteRoute.POST, { cookie, body: { confirm: "learner-password" } })).status,
    ).toBe(200);
    expect(await getDb().select().from(user).where(eq(user.username, username))).toEqual([]);
  });

  it("deleting a class schedules students with no other class for deletion in 30 days", async () => {
    const t = await teacher();
    const only = await classWithSeats(t, 1);
    const other = await classWithSeats(await teacher(), 1);
    const loner = await join(only.seats[0]!.code!);
    const [lonerRow] = await getDb()
      .select()
      .from(user)
      .where(eq(user.username, loner.data.handle as string));

    expect(
      (await call(classRoute.DELETE, { cookie: t, id: only.id, method: "DELETE" })).status,
    ).toBe(200);
    const [scheduled] = await getDb().select().from(user).where(eq(user.id, lonerRow!.id));
    const days = (scheduled!.scheduledDeletionAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);

    // Joining another class within 30 days cancels the deletion.
    await call(joinRedeem.POST, {
      cookie: loner.cookie,
      body: { code: other.seats[0]!.code!, kind: "join" },
    });
    const [kept] = await getDb().select().from(user).where(eq(user.id, lonerRow!.id));
    expect(kept!.scheduledDeletionAt).toBeNull();
  });

  it("the purge deletes students whose 30 days have passed, and logs it", async () => {
    const t = await teacher();
    const { id, seats } = await classWithSeats(t, 1);
    const joined = await join(seats[0]!.code!);
    await call(classRoute.DELETE, { cookie: t, id, method: "DELETE" });
    const purged = await purgeScheduledDeletions(new Date(Date.now() + 31 * 86_400_000));
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(
      await getDb()
        .select()
        .from(user)
        .where(eq(user.username, joined.data.handle as string)),
    ).toEqual([]);
    const logs = await getDb()
      .select()
      .from(adminActionLog)
      .where(eq(adminActionLog.action, "purge_scheduled_students"));
    expect(logs.length).toBeGreaterThan(0);
  });
});
