import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importPayloadSchema } from "@/lib/content/import-schema";

// The seed must stay importable, so a hand edit to the JSON fails here instead of in e2e.
const raw: unknown = JSON.parse(readFileSync(new URL("./seed-40.json", import.meta.url), "utf8"));

describe("seed-40.json fixture", () => {
  const result = importPayloadSchema.safeParse(raw);

  it("passes import validation", () => {
    const issues = result.success
      ? []
      : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    expect(issues).toEqual([]);
  });

  it("is marked as a fixture, so production refuses it", () => {
    expect(result.data?.fixture).toBe(true);
  });

  it("has 40 words, and every relation target is in the seed", () => {
    const lemmas = result.data?.lemmas ?? [];
    expect(lemmas).toHaveLength(40);
    const senseKeys = new Set(lemmas.flatMap((l) => l.senses.map((s) => s.key)));
    const targets = lemmas.flatMap((l) =>
      l.senses.flatMap((s) => s.relations.flatMap((r) => (r.targetKey ? [r.targetKey] : []))),
    );
    expect(targets.filter((t) => !senseKeys.has(t))).toEqual([]);
  });
});
