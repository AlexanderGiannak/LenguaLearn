import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAdminToken } from "@/lib/admin/auth";
import { POST as importPost } from "./import/route";
import { POST as statusPost } from "./status/route";

// These cases are all refused before the database is touched, so they run without one.
// The success paths are covered by the database tests and the end-to-end seed.

const TOKEN = "route-test-token-0123456789abcdef0123456789";

function post(url: string, body: string, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });
}

const routes = [
  ["import", importPost, "http://localhost/api/admin/import"],
  ["status", statusPost, "http://localhost/api/admin/status"],
] as const;

beforeEach(() => {
  vi.stubEnv("ADMIN_API_TOKEN_HASH", hashAdminToken(TOKEN));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(routes)("POST /api/admin/%s", (_name, handler, url) => {
  const auth = { authorization: `Bearer ${TOKEN}` };

  it("rejects a request without a token", async () => {
    const res = await handler(post(url, "{}"));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    const res = await handler(post(url, "{}", { authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("rejects every token when no hash is configured", async () => {
    vi.stubEnv("ADMIN_API_TOKEN_HASH", "");
    const res = await handler(post(url, "{}", auth));
    expect(res.status).toBe(401);
  });

  it("rejects browser requests, even with the right token", async () => {
    const res = await handler(post(url, "{}", { ...auth, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("rejects a body that is not JSON", async () => {
    const res = await handler(post(url, "not json", auth));
    expect(res.status).toBe(400);
  });

  it("rejects a body that is too large", async () => {
    const res = await handler(post(url, "x".repeat(6 * 1024 * 1024), auth));
    expect(res.status).toBe(413);
  });

  it("rejects an invalid payload with a list of issues", async () => {
    const res = await handler(post(url, JSON.stringify({ unexpected: true }), auth));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: unknown[] };
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("never caches responses", async () => {
    const res = await handler(post(url, "{}"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("fixture content", () => {
  it("is refused in Railway production", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    const res = await importPost(
      post("http://localhost/api/admin/import", JSON.stringify({ fixture: true, lemmas: [] }), {
        authorization: `Bearer ${TOKEN}`,
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("status changes", () => {
  it("rejects an unknown table name", async () => {
    const res = await statusPost(
      post(
        "http://localhost/api/admin/status",
        JSON.stringify({ changes: [{ table: "answer_event", id: 1, to: "live" }] }),
        { authorization: `Bearer ${TOKEN}` },
      ),
    );
    expect(res.status).toBe(400);
  });
});
