import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { getDb, getSql } from "@/lib/db/client";
import { audio, example, lemma, reviewLog, sense, user } from "@/lib/db/schema";
import { reviewerFor } from "@/lib/review/access";
import { approveSense, flagAudio, publishApproved, reviewQueue } from "@/lib/review/service";
import { attachAudio, audioNeeds } from "./audio";

// TEST FIXTURE: the Spanish text below is test data, not content.

afterAll(async () => {
  await getSql().end();
});

const uniq = () => randomUUID().slice(0, 8);

function payload(p: string, sentence = "El perro duerme en su cama.") {
  return importPayloadSchema.parse({
    lemmas: [
      {
        key: `${p}perro#noun`,
        headword: `${p}perro`,
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
            examples: [
              {
                text: sentence,
                surfaceForm: "perro",
                start: 3,
                end: 8,
                translation: "The dog sleeps in its bed.",
                distractors: ["gato", "libro", "río"],
                source: "ai",
              },
            ],
          },
        ],
      },
    ],
  });
}

async function newWord() {
  const p = `a${uniq()}`;
  const report = await importContent(getDb(), payload(p));
  const senseId = report.rows.find((r) => r.table === "sense")!.id;
  return { p, key: `${p}perro#noun`, senseId };
}

const attachAll = (needs: Awaited<ReturnType<typeof audioNeeds>>, tag = "a") =>
  attachAudio(getDb(), {
    items: needs.map((n) => ({
      owner: n.owner,
      id: n.id,
      text: n.text,
      fileKey: `audio/${tag}${n.owner}${n.id}.mp3`,
      voiceId: "fixture",
      generatedAt: new Date().toISOString(),
    })),
  });

async function admin() {
  const id = `u${uniq()}`;
  await getDb()
    .insert(user)
    .values({ id, name: "Admin", email: `${id}@example.com`, role: "admin", emailVerified: true });
  return reviewerFor({
    id,
    role: "admin",
    name: "Admin",
    username: null,
    email: `${id}@example.com`,
    emailVerified: true,
  });
}

describe("audio needs and attaching", () => {
  it("lists the headword with its article and each sentence, then nothing once attached", async () => {
    const w = await newWord();
    const needs = await audioNeeds(getDb(), { lemmaKey: w.key });
    expect(needs.map((n) => [n.owner, n.text])).toEqual([
      ["lemma", `el ${w.p}perro`],
      ["example", "El perro duerme en su cama."],
    ]);
    expect(needs[1]!.key).toBe(`${w.key}#1#ex1`);
    expect(needs.every((n) => !n.remake)).toBe(true);

    expect(await attachAll(needs)).toEqual({ attached: 2, unchanged: 0, stale: [] });
    expect(await audioNeeds(getDb(), { lemmaKey: w.key })).toEqual([]);
    const rows = await getDb().select().from(audio).where(eq(audio.lemmaId, needs[0]!.id));
    expect(rows[0]).toMatchObject({ status: "draft", spokenText: `el ${w.p}perro` });

    // Attaching the same file again changes nothing.
    expect(await attachAll(needs)).toEqual({ attached: 0, unchanged: 2, stale: [] });
  });

  it("lists every recording of one word again when asked to remake it", async () => {
    const w = await newWord();
    await attachAll(await audioNeeds(getDb(), { lemmaKey: w.key }));
    expect(await audioNeeds(getDb(), { lemmaKey: w.key, all: true })).toHaveLength(2);
    // "all" without a word is ignored: never the whole catalog by accident.
    const everything = await audioNeeds(getDb(), { all: true });
    expect(everything.some((n) => n.key.startsWith(w.key))).toBe(false);
  });

  it("skips a recording whose sentence changed after the script asked", async () => {
    const w = await newWord();
    const needs = await audioNeeds(getDb(), { lemmaKey: w.key });
    await importContent(getDb(), payload(w.p, "El perro come en su cama."));
    const r = await attachAll(needs);
    expect(r.attached).toBe(1);
    expect(r.stale).toEqual([{ owner: "example", id: needs[1]!.id }]);
  });

  it("keeps recordings when the same word is uploaded again, and drops one whose sentence changed", async () => {
    const w = await newWord();
    const needs = await audioNeeds(getDb(), { lemmaKey: w.key });
    await attachAll(needs);

    await importContent(getDb(), payload(w.p));
    expect(await audioNeeds(getDb(), { lemmaKey: w.key })).toEqual([]);

    await importContent(getDb(), payload(w.p, "El perro come en su cama."));
    const again = await audioNeeds(getDb(), { lemmaKey: w.key });
    expect(again.map((n) => n.text)).toEqual(["El perro come en su cama."]);
    const [old] = await getDb().select().from(audio).where(eq(audio.exampleId, needs[1]!.id));
    expect(old!.status).toBe("retired");
  });

  it("refuses a recording for a retired sentence", async () => {
    const w = await newWord();
    const needs = await audioNeeds(getDb(), { lemmaKey: w.key });
    await getDb().update(example).set({ status: "retired" }).where(eq(example.id, needs[1]!.id));
    const r = await attachAll(needs);
    expect(r.stale).toHaveLength(1);
  });
});

describe("a reviewer flags a pronunciation", () => {
  it("retires it, lists it for remaking, and the remake is approved and published", async () => {
    const reviewer = await admin();
    const w = await newWord();
    await attachAll(await audioNeeds(getDb(), { lemmaKey: w.key }));
    await approveSense(getDb(), reviewer, w.senseId);
    await publishApproved(getDb(), reviewer);
    const [s] = await getDb().select().from(sense).where(eq(sense.id, w.senseId));
    expect(s!.status).toBe("live");

    await flagAudio(
      getDb(),
      reviewer,
      w.senseId,
      { owner: "lemma" },
      "stress on the wrong syllable",
    );
    const needs = await audioNeeds(getDb(), { lemmaKey: w.key });
    expect(needs.map((n) => [n.owner, n.remake])).toEqual([["lemma", true]]);
    const [log] = await getDb()
      .select()
      .from(reviewLog)
      .where(eq(reviewLog.senseId, w.senseId))
      .orderBy(reviewLog.id);
    expect(log).toBeDefined();

    // The remake waits on a live sense: it shows in "Changes to live words".
    await attachAll(needs, "b");
    const queue = await reviewQueue(getDb(), { status: "changed", limit: 500 });
    expect(queue.rows.some((r) => r.senseId === w.senseId)).toBe(true);

    await approveSense(getDb(), reviewer, w.senseId);
    await publishApproved(getDb(), reviewer);
    const [l] = await getDb().select().from(lemma).where(eq(lemma.key, w.key));
    const [rec] = await getDb().select().from(audio).where(eq(audio.lemmaId, l!.id));
    expect(rec).toMatchObject({ status: "live", fileKey: `audio/blemma${l!.id}.mp3` });
    const after = await reviewQueue(getDb(), { status: "changed", limit: 500 });
    expect(after.rows.some((r) => r.senseId === w.senseId)).toBe(false);
  });

  it("refuses to flag a sentence of another sense", async () => {
    const reviewer = await admin();
    const a = await newWord();
    const b = await newWord();
    const needsB = await audioNeeds(getDb(), { lemmaKey: b.key });
    await attachAll(needsB);
    await expect(
      flagAudio(
        getDb(),
        reviewer,
        a.senseId,
        { owner: "example", exampleId: needsB[1]!.id },
        "x y z",
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
