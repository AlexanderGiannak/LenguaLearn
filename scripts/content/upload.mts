// Content pipeline: uploads the files in content/import/ (written by content:check) through
// the admin import endpoint. It never publishes: senses arrive as ai_checked or draft, and
// reach students only after review (spec: status flow).
//
//   npm run content:upload                          # the local app, http://localhost:3000
//   npm run content:upload -- https://lengualearn.com --yes
//
// Needs ADMIN_API_TOKEN (from .env.local, or the environment) for the target site.
import { readdirSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const baseUrl = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const token = process.env.ADMIN_API_TOKEN;
if (!token) {
  console.error("ADMIN_API_TOKEN is not set. Run `npm run admin:token` to make one.");
  process.exit(1);
}
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl);
if (!local && !args.includes("--yes")) {
  console.error(`Uploading to ${baseUrl} changes that site's content. Add --yes to go ahead.`);
  process.exit(1);
}

const dir = new URL("../../content/import/", import.meta.url);
const files = readdirSync(dir)
  .filter((n) => /^import-\d+\.json$/.test(n))
  .sort();
if (files.length === 0) {
  console.log("Nothing in content/import/. Run npm run content:check first.");
  process.exit(0);
}

const totals: Record<string, number> = {};
for (const name of files) {
  const res = await fetch(`${baseUrl}/api/admin/import`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: readFileSync(new URL(name, dir), "utf8"),
  });
  const text = await res.text();
  if (!res.ok) {
    // Each file is one transaction: earlier files are in, this one and later ones are not.
    console.error(`${name} was refused (${res.status}): ${text}`);
    console.error(
      "Files before it were imported; fix this one and run again (imports are safe to repeat).",
    );
    process.exit(1);
  }
  const { counts } = JSON.parse(text) as { counts: Record<string, number> };
  for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v;
  console.log(`${name}:`, counts);
}
console.log("Total:", totals);
