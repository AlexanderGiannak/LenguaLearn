import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { contentRevision, example, lemma, sense, wordListItem } from "@/lib/db/schema";
import { ImportError, importContent } from "./import";
import { importPayloadSchema, type ImportPayloadInput } from "./import-schema";

// TEST FIXTURE: Spanish text below is test data, not content.
// Each test uses its own key prefix, so tests never see each other's rows.
let counter = 0;
function prefix(): string {
  counter += 1;
  return `t${Date.now().toString(36)}${counter}`;
}

function payload(p: string, overrides: Partial<ImportPayloadInput> = {}) {
  const input: ImportPayloadInput = {
    lemmas: [
      {
        key: `${p}casa#noun`,
        headword: "casa",
        partOfSpeech: "noun",
        gender: "f",
        frequencyRank: 1200,
        status: "ai_checked",
        senses: [
          {
            key: `${p}casa#noun#1`,
            gloss: "house",
            definition: "A building where people live.",
            frequencyRank: 1200,
            register: "neutral",
            cognate: "none",
            concreteness: "concrete",
            status: "ai_checked",
            examples: [
              {
                text: "Mi casa es pequeña.",
                surfaceForm: "casa",
                start: 3,
                end: 7,
                translation: "My house is small.",
                distractors: ["mesa", "calle", "playa"],
                source: "ai",
              },
              {
                text: "Vamos a tu casa.",
                surfaceForm: "casa",
                start: 11,
                end: 15,
                translation: "Let's go to your house.",
                distractors: ["mesa", "calle", "playa"],
                source: "ai",
              },
            ],
            relations: [{ type: "family", text: "casita" }],
          },
        ],
      },
    ],
    ...overrides,
  };
  return importPayloadSchema.parse(input);
}

async function senseRow(key: string) {
  const [row] = await getDb().select().from(sense).where(eq(sense.key, key));
  return row!;
}

afterAll(async () => {
  await getSql().end();
});

describe("importContent", () => {
  it("creates every row in the import status at version 1, with level from rank", async () => {
    const p = prefix();
    const report = await importContent(getDb(), payload(p));

    expect(report.counts).toEqual({ created: 5, updated: 0, unchanged: 0, retired: 0 });
    const s = await senseRow(`${p}casa#noun#1`);
    expect(s).toMatchObject({ status: "ai_checked", version: 1, level: 3 });
    const examples = await getDb().select().from(example).where(eq(example.senseId, s.id));
    expect(examples.map((e) => e.position).sort()).toEqual([0, 1]);
  });

  it("reports unchanged rows on an identical re-import and keeps the version", async () => {
    const p = prefix();
    await importContent(getDb(), payload(p));
    const report = await importContent(getDb(), payload(p));

    expect(report.counts).toEqual({ created: 0, updated: 0, unchanged: 5, retired: 0 });
    expect((await senseRow(`${p}casa#noun#1`)).version).toBe(1);
  });

  it("bumps the version and keeps the old row as a revision when content changes", async () => {
    const p = prefix();
    await importContent(getDb(), payload(p));
    const before = await senseRow(`${p}casa#noun#1`);

    const changed = payload(p);
    changed.lemmas[0]!.senses[0]!.gloss = "home";
    const report = await importContent(getDb(), changed);

    expect(report.counts).toMatchObject({ updated: 1, unchanged: 4 });
    const after = await senseRow(`${p}casa#noun#1`);
    expect(after.id).toBe(before.id); // student history keeps pointing at the same sense
    expect(after).toMatchObject({ gloss: "home", version: 2 });

    const revisions = await getDb()
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.tableName, "sense"), eq(contentRevision.rowId, before.id)));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ version: 1, snapshot: { gloss: "house" } });
  });

  it("leaves unchanged live rows live, and sends changed ones back through review", async () => {
    const p = prefix();
    await importContent(getDb(), payload(p));
    await getDb()
      .update(sense)
      .set({ status: "live" })
      .where(eq(sense.key, `${p}casa#noun#1`));

    await importContent(getDb(), payload(p));
    expect((await senseRow(`${p}casa#noun#1`)).status).toBe("live");

    const changed = payload(p);
    changed.lemmas[0]!.senses[0]!.definition = "A building that people live in.";
    await importContent(getDb(), changed);
    expect(await senseRow(`${p}casa#noun#1`)).toMatchObject({ status: "ai_checked", version: 2 });
  });

  it("retires children that are no longer in the import instead of deleting them", async () => {
    const p = prefix();
    await importContent(getDb(), payload(p));

    const shorter = payload(p);
    shorter.lemmas[0]!.senses[0]!.examples.pop();
    const report = await importContent(getDb(), shorter);

    expect(report.counts.retired).toBe(1);
    const s = await senseRow(`${p}casa#noun#1`);
    const examples = await getDb()
      .select({ position: example.position, status: example.status })
      .from(example)
      .where(eq(example.senseId, s.id))
      .orderBy(example.position);
    expect(examples).toEqual([
      { position: 0, status: "ai_checked" },
      { position: 1, status: "retired" },
    ]);
  });

  it("creates word lists from sense keys", async () => {
    const p = prefix();
    const withList = payload(p, {
      lists: [
        { key: `${p}-list`, name: "Test list", status: "draft", senseKeys: [`${p}casa#noun#1`] },
      ],
    });
    await importContent(getDb(), withList);
    const s = await senseRow(`${p}casa#noun#1`);
    const items = await getDb().select().from(wordListItem).where(eq(wordListItem.senseId, s.id));
    expect(items).toHaveLength(1);
  });

  it("rejects a list with an unknown sense and writes nothing", async () => {
    const p = prefix();
    const bad = payload(p, {
      lists: [{ key: `${p}-list`, name: "Bad", status: "draft", senseKeys: [`${p}nada#noun#1`] }],
    });

    await expect(importContent(getDb(), bad)).rejects.toThrow(ImportError);
    const rows = await getDb()
      .select()
      .from(lemma)
      .where(eq(lemma.key, `${p}casa#noun`));
    expect(rows).toHaveLength(0);
  });
});

describe("database constraints", () => {
  it("refuses an example whose offsets do not match its surface form", async () => {
    const p = prefix();
    await importContent(getDb(), payload(p));
    const s = await senseRow(`${p}casa#noun#1`);

    await expect(
      getDb()
        .insert(example)
        .values({
          senseId: s.id,
          position: 9,
          text: "Mi casa es pequeña.",
          surfaceForm: "casa",
          startOffset: 0,
          endOffset: 4,
          translation: "My house is small.",
          distractors: ["mesa", "calle", "playa"],
          source: "ai",
        }),
    ).rejects.toThrow();
  });
});
