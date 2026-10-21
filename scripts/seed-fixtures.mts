// Loads the 40 AI-written fixture words into a running app and publishes them, so the word
// pages have something to show in local development, CI and PR previews. It goes through
// the admin API like the real content scripts will, and the server refuses fixture
// imports in production.
//
//   npm run seed:fixtures                       # http://localhost:3000
//   npm run seed:fixtures -- https://web-lengualearn-pr-3.up.railway.app
//
// Needs ADMIN_API_TOKEN (from .env.local, or the environment).
import { readFileSync } from "node:fs";

type Row = { table: string; id: number; status: string };

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.ADMIN_API_TOKEN;
if (!token) {
  console.error("ADMIN_API_TOKEN is not set. Run `npm run admin:token` to make one.");
  process.exit(1);
}
if (/web-production/.test(baseUrl)) {
  console.error("Refusing to seed fixtures into production.");
  process.exit(1);
}

async function post(path: string, body: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} returned ${res.status}: ${text}`);
  return JSON.parse(text);
}

const seed = readFileSync(new URL("../fixtures/content/seed-40.json", import.meta.url), "utf8");
const report = (await post("/api/admin/import", seed)) as {
  counts: Record<string, number>;
  rows: Row[];
};
console.log("Imported:", report.counts);

// Each row takes one allowed step at a time: ai_checked -> approved -> live.
const steps: Record<string, string[]> = { ai_checked: ["approved", "live"], approved: ["live"] };
const changes = report.rows.flatMap((r) =>
  (steps[r.status] ?? []).map((to) => ({ table: r.table, id: r.id, to })),
);
if (changes.length > 0) {
  const { applied } = (await post("/api/admin/status", JSON.stringify({ changes }))) as {
    applied: unknown[];
  };
  console.log(`Published: ${applied.length} status changes applied.`);
} else {
  console.log("Everything was already live.");
}
