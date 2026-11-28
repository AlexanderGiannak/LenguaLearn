import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { getDb, getSql } from "@/lib/db/client";
import { image, user } from "@/lib/db/schema";
import { reviewerFor } from "@/lib/review/access";
import { approveSense, publishApproved, rejectImage, reviewQueue } from "@/lib/review/service";
import { attachImages, imageNeeds } from "./images";

// TEST FIXTURE: the Spanish text below is test data, not content.

afterAll(async () => {
  await getSql().end();
});

const uniq = () => randomUUID().slice(0, 8);

function payload(
  p: string,
  opts: { description?: string; concreteness?: "concrete" | "abstract" } = {},
) {
  const concreteness = opts.concreteness ?? "concrete";
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
            concreteness,
            ...(concreteness === "concrete"
              ? { imageDescription: opts.description ?? "A brown dog sitting on grass." }
              : {}),
            status: "ai_checked",
          },
        ],
      },
    ],
  });
}

async function newWord() {
  const p = `i${uniq()}`;
  const report = await importContent(getDb(), payload(p));
  const senseId = report.rows.find((r) => r.table === "sense")!.id;
  return { p, key: `${p}perro#noun`, senseId };
}

const picture = (senseId: number, imageDescription: string, tag = "a") => ({
  senseId,
  imageDescription,
  fileKey: `images/${tag}${senseId}.jpg`,
  alt: "A brown dog sitting on grass",
  source: `https://example.org/${tag}${senseId}`,
  license: "CC BY 4.0",
  attribution: "Photo by a fixture",
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

const rowsFor = (senseId: number) => getDb().select().from(image).where(eq(image.senseId, senseId));

describe("image needs and attaching", () => {
  it("lists a concrete sense until a picture is attached, as a draft", async () => {
    const w = await newWord();
    const needs = await imageNeeds(getDb(), { lemmaKey: w.key });
    expect(needs).toEqual([
      {
        senseId: w.senseId,
        key: `${w.key}#1`,
        headword: `${w.p}perro`,
        gloss: "dog",
        imageDescription: "A brown dog sitting on grass.",
        rejected: [],
        rejectedReason: null,
      },
    ]);
    const item = picture(w.senseId, needs[0]!.imageDescription);
    expect(await attachImages(getDb(), { items: [item] })).toEqual({
      attached: 1,
      unchanged: 0,
      stale: [],
    });
    expect(await imageNeeds(getDb(), { lemmaKey: w.key })).toEqual([]);
    const [row] = await rowsFor(w.senseId);
    expect(row).toMatchObject({ status: "draft", position: 0, fileKey: item.fileKey });

    expect(await attachImages(getDb(), { items: [item] })).toMatchObject({ unchanged: 1 });
  });

  it("never lists abstract senses", async () => {
    const p = `i${uniq()}`;
    await importContent(getDb(), payload(p, { concreteness: "abstract" }));
    expect(await imageNeeds(getDb(), { lemmaKey: `${p}perro#noun` })).toEqual([]);
  });

  it("skips a picture whose description changed after the script asked", async () => {
    const w = await newWord();
    const [need] = await imageNeeds(getDb(), { lemmaKey: w.key });
    await importContent(getDb(), payload(w.p, { description: "A small white dog running." }));
    const r = await attachImages(getDb(), { items: [picture(w.senseId, need!.imageDescription)] });
    expect(r).toEqual({ attached: 0, unchanged: 0, stale: [w.senseId] });
  });

  it("does not replace a picture that is already there", async () => {
    const w = await newWord();
    const [need] = await imageNeeds(getDb(), { lemmaKey: w.key });
    await attachImages(getDb(), { items: [picture(w.senseId, need!.imageDescription)] });
    const r = await attachImages(getDb(), {
      items: [picture(w.senseId, need!.imageDescription, "b")],
    });
    expect(r.stale).toEqual([w.senseId]);
  });

  it("keeps the picture when the word is uploaded again, and drops it if the sense is no longer concrete", async () => {
    const w = await newWord();
    const [need] = await imageNeeds(getDb(), { lemmaKey: w.key });
    await attachImages(getDb(), { items: [picture(w.senseId, need!.imageDescription)] });

    await importContent(getDb(), payload(w.p));
    expect((await rowsFor(w.senseId))[0]!.status).toBe("draft");

    await importContent(getDb(), payload(w.p, { concreteness: "abstract" }));
    expect((await rowsFor(w.senseId))[0]!.status).toBe("retired");
    expect(await imageNeeds(getDb(), { lemmaKey: w.key })).toEqual([]);
  });
});

describe("a reviewer rejects a picture", () => {
  it("retires it, asks for another that is not the same one, and the new one is approved and published", async () => {
    const reviewer = await admin();
    const w = await newWord();
    const [need] = await imageNeeds(getDb(), { lemmaKey: w.key });
    const first = picture(w.senseId, need!.imageDescription);
    await attachImages(getDb(), { items: [first] });
    await approveSense(getDb(), reviewer, w.senseId);
    await publishApproved(getDb(), reviewer);

    await rejectImage(getDb(), reviewer, w.senseId, "shows a wolf, not a dog");
    expect((await rowsFor(w.senseId))[0]!.status).toBe("retired");
    const [again] = await imageNeeds(getDb(), { lemmaKey: w.key });
    expect(again).toMatchObject({
      rejected: [first.source],
      rejectedReason: "shows a wolf, not a dog",
    });

    // The new picture reuses the slot (the old one stays in the revisions) and waits on
    // the live sense in "Changes to live words".
    const second = picture(w.senseId, need!.imageDescription, "b");
    expect(await attachImages(getDb(), { items: [second] })).toMatchObject({ attached: 1 });
    const queue = await reviewQueue(getDb(), { status: "changed", limit: 1_000_000 });
    expect(queue.rows.some((r) => r.senseId === w.senseId)).toBe(true);
    await approveSense(getDb(), reviewer, w.senseId);
    await publishApproved(getDb(), reviewer);
    const rows = await rowsFor(w.senseId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "live", fileKey: second.fileKey });

    // Rejected twice: both earlier sources are listed.
    await rejectImage(getDb(), reviewer, w.senseId, "too dark");
    const [third] = await imageNeeds(getDb(), { lemmaKey: w.key });
    expect(third!.rejected).toEqual([first.source, second.source].sort());
    expect(third!.rejectedReason).toBe("too dark");
  });

  it("refuses when there is no picture", async () => {
    const reviewer = await admin();
    const w = await newWord();
    await expect(rejectImage(getDb(), reviewer, w.senseId, "none here")).rejects.toMatchObject({
      status: 404,
    });
  });
});
