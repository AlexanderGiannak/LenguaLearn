import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { importContent } from "./import";
import { importPayloadSchema } from "./import-schema";
import { applyStatusChanges } from "./status-changes";
import { getLiveWordPage, getReviewWordPage } from "./word-page";

// TEST FIXTURE: the Spanish text below is test data, not content.

afterAll(async () => {
  await getSql().end();
});

async function importDraft() {
  const p = `w${randomUUID().slice(0, 8)}`;
  const example = (text: string) => ({
    text,
    surfaceForm: "perro",
    start: text.indexOf("perro"),
    end: text.indexOf("perro") + 5,
    translation: "A fixture translation.",
    distractors: ["gato", "libro", "río"],
    source: "ai",
  });
  const report = await importContent(
    getDb(),
    importPayloadSchema.parse({
      lemmas: [
        {
          key: `${p}perro#noun`,
          headword: "perro",
          partOfSpeech: "noun",
          gender: "m",
          frequencyRank: 300,
          status: "draft",
          senses: [
            {
              key: `${p}perro#noun#1`,
              gloss: "dog",
              definition: "A common pet animal that barks.",
              frequencyRank: 300,
              register: "neutral",
              cognate: "none",
              concreteness: "concrete",
              status: "draft",
              examples: [example("El perro duerme."), example("Mi perro come.")],
            },
          ],
        },
      ],
    }),
  );
  return report.rows;
}

describe("word page loaders", () => {
  it("show students only live content, and reviewers everything not retired", async () => {
    const rows = await importDraft();
    const senseId = rows.find((r) => r.table === "sense")!.id;
    const [first, second] = rows.filter((r) => r.table === "example");

    expect(await getLiveWordPage(senseId)).toBeNull();
    const review = await getReviewWordPage(senseId);
    expect(review?.examples.map((e) => e.text)).toEqual(["El perro duerme.", "Mi perro come."]);

    await applyStatusChanges(getDb(), [{ table: "example", id: second!.id, to: "retired" }]);
    expect((await getReviewWordPage(senseId))?.examples.map((e) => e.id)).toEqual([first!.id]);

    // Live sense and lemma, but one example still a draft: students do not see it.
    const live = rows
      .filter((r) => r.table === "sense" || r.table === "lemma")
      .flatMap((r) => [
        { table: r.table, id: r.id, to: "approved" as const },
        { table: r.table, id: r.id, to: "live" as const },
      ]);
    await applyStatusChanges(getDb(), live, "human-review");
    const page = await getLiveWordPage(senseId);
    expect(page?.sense.id).toBe(senseId);
    expect(page?.examples).toEqual([]);
    expect((await getReviewWordPage(senseId))?.examples.map((e) => e.id)).toEqual([first!.id]);
  });
});
