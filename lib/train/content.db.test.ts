import { afterAll, expect, it } from "vitest";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { applyStatusChanges } from "@/lib/content/status-changes";
import { getDb, getSql } from "@/lib/db/client";
import { clearTrainingContentCache, getTrainingContent } from "./content";

afterAll(async () => {
  await getSql().end();
});

it("gives the engine only the live misuse sentences of a live sense", async () => {
  // TEST FIXTURE: Spanish text below is test data, not content.
  const p = `m${Date.now().toString(36)}`;
  const report = await importContent(
    getDb(),
    importPayloadSchema.parse({
      lemmas: [
        {
          key: `${p}casa#noun`,
          headword: "casa",
          partOfSpeech: "noun",
          gender: "f",
          frequencyRank: 1300,
          status: "ai_checked",
          senses: [
            {
              key: `${p}casa#noun#1`,
              gloss: "house",
              definition: "A building where people live.",
              frequencyRank: 1300,
              register: "neutral",
              cognate: "none",
              concreteness: "concrete",
              status: "ai_checked",
              misuses: [
                { text: "Mi perro casa en el jardín.", explanation: "A verb.", source: "ai" },
                { text: "Hoy casa mucho calor.", explanation: "Not hacer.", source: "ai" },
              ],
            },
          ],
        },
      ],
    }),
  );
  // Publish the lemma, the sense and the first misuse; the second stays in review.
  const reviewed = report.rows.filter(
    (r) => r.table !== "misuse" || r === report.rows.find((m) => m.table === "misuse"),
  );
  await applyStatusChanges(
    getDb(),
    reviewed.flatMap((r) => [
      { table: r.table, id: r.id, to: "approved" as const },
      { table: r.table, id: r.id, to: "live" as const },
    ]),
  );
  clearTrainingContentCache();

  const senseId = report.rows.find((r) => r.table === "sense")!.id;
  const content = await getTrainingContent();
  expect(content.byId.get(senseId)!.misuses).toEqual(["Mi perro casa en el jardín."]);
});
