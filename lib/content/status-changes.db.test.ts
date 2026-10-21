import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { sense } from "@/lib/db/schema";
import { importContent } from "./import";
import { importPayloadSchema } from "./import-schema";
import { applyStatusChanges, StatusChangeError } from "./status-changes";

// TEST FIXTURE: Spanish text below is test data, not content.
async function importOneSense() {
  const p = `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
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
          status: "ai_checked",
          senses: [
            {
              key: `${p}perro#noun#1`,
              gloss: "dog",
              definition: "A common pet animal that barks.",
              frequencyRank: 300,
              register: "neutral",
              cognate: "none",
              concreteness: "concrete",
              status: "ai_checked",
            },
          ],
        },
      ],
    }),
  );
  const senseId = report.rows.find((r) => r.table === "sense")!.id;
  const lemmaId = report.rows.find((r) => r.table === "lemma")!.id;
  return { senseId, lemmaId };
}

async function statusOf(id: number) {
  const [row] = await getDb().select({ status: sense.status }).from(sense).where(eq(sense.id, id));
  return row?.status;
}

afterAll(async () => {
  await getSql().end();
});

describe("applyStatusChanges", () => {
  it("moves rows one allowed step at a time", async () => {
    const { senseId } = await importOneSense();
    await applyStatusChanges(getDb(), [{ table: "sense", id: senseId, to: "approved" }]);
    expect(await statusOf(senseId)).toBe("approved");
    const result = await applyStatusChanges(getDb(), [{ table: "sense", id: senseId, to: "live" }]);
    expect(result).toEqual([{ table: "sense", id: senseId, from: "approved", to: "live" }]);
    expect(await statusOf(senseId)).toBe("live");
  });

  it("refuses a skipped step and applies nothing from the batch", async () => {
    const { senseId, lemmaId } = await importOneSense();
    const attempt = applyStatusChanges(getDb(), [
      { table: "lemma", id: lemmaId, to: "approved" }, // allowed
      { table: "sense", id: senseId, to: "live" }, // ai_checked -> live is not
    ]);
    await expect(attempt).rejects.toThrow(StatusChangeError);
    await expect(attempt).rejects.toMatchObject({
      problems: [expect.stringContaining("ai_checked -> live")],
    });
    expect(await statusOf(senseId)).toBe("ai_checked");
  });

  it("reports rows that do not exist", async () => {
    await expect(
      applyStatusChanges(getDb(), [{ table: "sense", id: 2_000_000_000, to: "approved" }]),
    ).rejects.toMatchObject({ problems: [expect.stringContaining("not found")] });
  });
});
