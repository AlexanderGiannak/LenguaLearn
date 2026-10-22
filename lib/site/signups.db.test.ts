import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { signUp } from "@/lib/auth/accounts";
import { getDb, getSql } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

// lengualearn.com before opening: no account can be created, whatever the path. The auth
// hook is the backstop under the routes' own refusals.

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await getSql().end();
});

const email = () => `closed-${randomUUID().slice(0, 8)}@example.com`;

describe("accounts before opening", () => {
  it("refuses a new account in production until SIGNUPS_OPEN=1", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    // Local .env.local may turn demo mode on, which opens accounts.
    vi.stubEnv("DEMO_SITE", "");
    const address = email();
    await expect(
      signUp({ role: "teacher", name: "T", email: address, password: "closed-password-1" }),
    ).rejects.toThrow();
    expect(await getDb().select().from(user).where(eq(user.email, address))).toHaveLength(0);

    vi.stubEnv("SIGNUPS_OPEN", "1");
    const opened = email();
    await signUp({ role: "teacher", name: "T", email: opened, password: "closed-password-1" });
    expect(await getDb().select().from(user).where(eq(user.email, opened))).toHaveLength(1);
  });

  it("allows accounts on the demo site", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "demo");
    vi.stubEnv("DEMO_SITE", "1");
    const address = email();
    await signUp({ role: "teacher", name: "T", email: address, password: "closed-password-1" });
    expect(await getDb().select().from(user).where(eq(user.email, address))).toHaveLength(1);
  });
});
