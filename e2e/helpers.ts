import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

// Shared steps for end-to-end tests. Accounts are made through the real API, so the
// browser holds a real session cookie.

const uniq = () => randomUUID().slice(0, 8);

async function post(page: Page, url: string, data: unknown) {
  const res = await page.request.post(url, {
    data,
    headers: {
      origin: new URL(page.url() === "about:blank" ? "http://localhost:3000" : page.url()).origin,
    },
  });
  expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
  return res;
}

export async function signUpLearner(page: Page) {
  const username = `e2e${uniq()}`;
  await post(page, "/api/account/sign-up", {
    role: "learner",
    username,
    password: "learner-password",
    ageConfirmed: true,
  });
  return username;
}

/** A teacher with a verified email. Verification is marked directly in the test database. */
export async function signUpTeacher(page: Page) {
  const email = `e2e-${uniq()}@example.com`;
  await post(page, "/api/account/sign-up", {
    role: "teacher",
    name: "E2E Teacher",
    email,
    password: "teacher-password",
  });
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`update "user" set email_verified = true where email = ${email}`;
  } finally {
    await sql.end();
  }
  return email;
}
