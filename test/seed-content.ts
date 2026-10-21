import { readFileSync } from "node:fs";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { applyStatusChanges } from "@/lib/content/status-changes";
import { getDb } from "@/lib/db/client";
import { clearTrainingContentCache } from "@/lib/train/content";

/** Imports the 40 fixture words and publishes them, for database tests that train. */
export async function seedFixtureContent(): Promise<void> {
  const seed = importPayloadSchema.parse(
    JSON.parse(readFileSync("fixtures/content/seed-40.json", "utf8")),
  );
  const report = await importContent(getDb(), seed);
  const steps: Record<string, ("approved" | "live")[]> = {
    ai_checked: ["approved", "live"],
    approved: ["live"],
  };
  const changes = report.rows.flatMap((r) =>
    (steps[r.status] ?? []).map((to) => ({ table: r.table, id: r.id, to })),
  );
  if (changes.length) await applyStatusChanges(getDb(), changes);
  clearTrainingContentCache();
}
