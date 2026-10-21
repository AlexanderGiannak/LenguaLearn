import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { session, user } from "@/lib/db/schema";
import { getAuth } from "./auth";

// Pins down how Better Auth behaves with this app's configuration.

afterAll(async () => {
  await getSql().end();
});

const BASE = "http://localhost:3000/api/auth";

async function signUp() {
  const name = `u${randomUUID().slice(0, 8)}`;
  const email = `${name}@example.com`;
  const res = await getAuth().api.signUpEmail({
    body: { email, password: "correct horse battery", name, username: name },
  });
  return { name, email, userId: res.user.id };
}

describe("Better Auth configuration", () => {
  it("still lets the app's own routes sign up and sign in on the server", async () => {
    const { name } = await signUp();
    const res = await getAuth().api.signInUsername({
      body: { username: name, password: "correct horse battery" },
      asResponse: true,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/session_token=.*HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=Lax/i);
  });

  it.each([
    ["sign-up/email", { email: "x@example.com", password: "password123", name: "x" }],
    ["sign-in/email", { email: "x@example.com", password: "password123" }],
    ["sign-in/username", { username: "someone", password: "password123" }],
    ["update-user", { name: "Real Name" }],
    ["change-email", { newEmail: "x@example.com" }],
  ])("refuses public HTTP calls to /%s", async (path, body) => {
    const res = await getAuth().handler(
      new Request(`${BASE}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("never stores an IP address or user agent with a session", async () => {
    const { name, userId } = await signUp();
    await getAuth().api.signInUsername({
      body: { username: name, password: "correct horse battery" },
      headers: new Headers({ "x-forwarded-for": "203.0.113.9", "user-agent": "TestBrowser/1.0" }),
    });
    const rows = await getDb().select().from(session).where(eq(session.userId, userId));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.ipAddress).toBeNull();
      expect(r.userAgent).toBeNull();
    }
  });

  it("hashes passwords with Argon2id", async () => {
    const { userId } = await signUp();
    const [row] = await getSql()`select password from account where user_id = ${userId}`;
    expect(row!.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("gives new users the learner role and ignores a role sent by the client", async () => {
    const name = `u${randomUUID().slice(0, 8)}`;
    const res = await getAuth().api.signUpEmail({
      body: {
        email: `${name}@example.com`,
        password: "correct horse battery",
        name,
        role: "admin",
      } as never,
    });
    const [row] = await getDb()
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, res.user.id));
    expect(row!.role).toBe("learner");
  });
});
