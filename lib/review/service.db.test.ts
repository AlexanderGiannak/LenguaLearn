import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { getDb, getSql } from "@/lib/db/client";
import {
  contentRevision,
  example,
  lemma,
  pseudoword,
  reviewLog,
  sense,
  user,
  type Role,
} from "@/lib/db/schema";
import { reviewerFor } from "./access";
import { senseEditSchema, type SenseEdit } from "./schema";
import {
  approveSense,
  checkCounts,
  decidePseudowords,
  editSense,
  publishApproved,
  nextInQueue,
  rejectSense,
  reviewQueue,
  senseForReview,
} from "./service";

// TEST FIXTURE: the Spanish text below is test data, not content.

afterAll(async () => {
  await getSql().end();
});

const uniq = () => randomUUID().slice(0, 8);

async function makeUser(role: Role, opts: { canReview?: boolean; verified?: boolean } = {}) {
  const id = `u${uniq()}`;
  const row = {
    id,
    name: role === "student" ? `h${uniq()}` : "Reviewer",
    email: role === "student" ? `${id}@students.invalid` : `${id}@example.com`,
    role,
    emailVerified: opts.verified ?? true,
    canReview: opts.canReview ?? false,
  };
  await getDb().insert(user).values(row);
  const current: CurrentUser = {
    id,
    role,
    name: row.name,
    username: null,
    email: row.email,
    emailVerified: row.emailVerified,
  };
  return current;
}

async function importSense(status: "draft" | "ai_checked" = "ai_checked") {
  const p = `r${uniq()}`;
  const text = "El perro duerme en su cama.";
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
          status,
          senses: [
            {
              key: `${p}perro#noun#1`,
              gloss: "dog",
              definition: "A common pet animal that barks.",
              frequencyRank: 300,
              register: "neutral",
              cognate: "none",
              concreteness: "concrete",
              status,
              checkNotes: {
                checkedAt: new Date().toISOString(),
                failures: [{ field: "gloss", check: "reviewer", message: "fixture note" }],
              },
              examples: [
                {
                  text,
                  surfaceForm: "perro",
                  start: 3,
                  end: 8,
                  translation: "The dog sleeps in its bed.",
                  distractors: ["gato", "libro", "río"],
                  source: "ai",
                  audio: {
                    fileKey: `audio/${p}.mp3`,
                    voiceId: "fixture",
                    generatedAt: new Date().toISOString(),
                  },
                },
              ],
              hooks: [{ kind: "mnemonic", text: "A fixture hook.", source: "ai" }],
            },
          ],
        },
      ],
    }),
  );
  const senseId = report.rows.find((r) => r.table === "sense")!.id;
  return { senseId, key: `${p}perro#noun#1` };
}

async function editOf(senseId: number, viewerId: string): Promise<SenseEdit> {
  const v = await senseForReview(getDb(), senseId, viewerId);
  return senseEditSchema.parse({
    loadedAt: v.sense.updatedAt.toISOString(),
    gloss: v.sense.gloss,
    definition: v.sense.definition,
    register: v.sense.register,
    cognate: v.sense.cognate,
    concreteness: v.sense.concreteness,
    themes: v.sense.themes,
    examples: v.examples.map((e) => ({
      text: e.text,
      surfaceForm: e.surfaceForm,
      translation: e.translation,
      distractors: e.distractors,
    })),
    hooks: v.hooks.map((h) => ({ kind: h.kind, text: h.text })),
    relations: [],
    misuses: [],
  });
}

const statusOf = async (id: number) =>
  (await getDb().select({ s: sense.status }).from(sense).where(eq(sense.id, id)))[0]!.s;

describe("who may review", () => {
  it("allows the admin and teachers the admin made reviewers", async () => {
    const admin = await makeUser("admin");
    expect(await reviewerFor(admin)).toEqual({ id: admin.id, isAdmin: true });
    const t = await makeUser("teacher", { canReview: true });
    expect(await reviewerFor(t)).toEqual({ id: t.id, isAdmin: false });
  });

  it("refuses other teachers, unverified reviewers, learners and students", async () => {
    for (const u of [
      await makeUser("teacher"),
      await makeUser("teacher", { canReview: true, verified: false }),
      await makeUser("learner"),
      await makeUser("student"),
    ]) {
      await expect(reviewerFor(u)).rejects.toMatchObject({ status: 403 });
    }
  });

  it("never lets a learner or student account be a reviewer", async () => {
    await expect(makeUser("learner", { canReview: true })).rejects.toThrow();
    await expect(makeUser("student", { canReview: true })).rejects.toThrow();
  });
});

describe("editing", () => {
  it("saves a fix as a new draft version, places the word and keeps the old version", async () => {
    const t = await makeUser("teacher", { canReview: true });
    const r = await reviewerFor(t);
    const { senseId } = await importSense();
    const edit = await editOf(senseId, t.id);
    edit.examples[0]!.text = "Mi perro duerme mucho.";
    edit.examples[0]!.translation = "My dog sleeps a lot.";

    expect(await editSense(getDb(), r, senseId, edit)).toEqual({ changed: true });

    const v = await senseForReview(getDb(), senseId, t.id);
    const ex = v.examples[0]!;
    expect(ex).toMatchObject({
      text: "Mi perro duerme mucho.",
      startOffset: 3,
      endOffset: 8,
      source: "human",
      status: "draft",
      version: 2,
    });
    expect(v.hooks[0]).toMatchObject({ source: "ai", status: "draft" });
    expect(v.log).toMatchObject([{ action: "edit", byYou: true }]);
    const revisions = await getDb()
      .select()
      .from(contentRevision)
      .where(and(eq(contentRevision.tableName, "example"), eq(contentRevision.rowId, ex.id)));
    expect(revisions).toHaveLength(1);
  });

  it("refuses an edit whose target word is not in the sentence, and saves nothing", async () => {
    const r = await reviewerFor(await makeUser("admin"));
    const { senseId } = await importSense();
    const edit = await editOf(senseId, r.id);
    edit.examples[0]!.text = "El gato duerme.";
    await expect(editSense(getDb(), r, senseId, edit)).rejects.toMatchObject({
      issues: [{ message: 'examples.0.surfaceForm: "perro" is not a word in the sentence' }],
    });
    expect(await statusOf(senseId)).toBe("ai_checked");
  });

  it("refuses a save over someone else's newer change", async () => {
    const r = await reviewerFor(await makeUser("admin"));
    const { senseId } = await importSense();
    const stale = await editOf(senseId, r.id);
    const fresh = await editOf(senseId, r.id);
    fresh.gloss = "hound";
    await editSense(getDb(), r, senseId, fresh);
    stale.gloss = "pup";
    await expect(editSense(getDb(), r, senseId, stale)).rejects.toMatchObject({ status: 409 });
    const { audio } = await import("@/lib/db/schema");
    const [ex] = await getDb().select().from(example).where(eq(example.senseId, senseId));
    const kept = await getDb().select().from(audio).where(eq(audio.exampleId, ex!.id));
    expect(kept.map((x) => x.status)).toEqual(["draft"]);
  });
});

describe("approving, rejecting and publishing", () => {
  it("lets a person approve a fixed draft, with its lemma and children", async () => {
    const r = await reviewerFor(await makeUser("teacher", { canReview: true }));
    const { senseId } = await importSense("draft");
    await approveSense(getDb(), r, senseId);
    const v = await senseForReview(getDb(), senseId, r.id);
    expect(v.sense.status).toBe("approved");
    expect(v.lemma.status).toBe("approved");
    expect(v.examples.map((e) => e.status)).toEqual(["approved"]);
    expect(v.hooks.map((h) => h.status)).toEqual(["approved"]);
    await expect(approveSense(getDb(), r, senseId)).rejects.toMatchObject({ status: 409 });
  });

  it("sends a rejected sense back to draft with the reason", async () => {
    const r = await reviewerFor(await makeUser("admin"));
    const { senseId } = await importSense();
    await rejectSense(getDb(), r, senseId, "The gloss is too narrow.");
    expect(await statusOf(senseId)).toBe("draft");
    const [entry] = await getDb().select().from(reviewLog).where(eq(reviewLog.senseId, senseId));
    expect(entry).toMatchObject({ action: "reject", reason: "The gloss is too narrow." });
  });

  it("publishes only for the admin", async () => {
    const reviewer = await reviewerFor(await makeUser("teacher", { canReview: true }));
    const admin = await reviewerFor(await makeUser("admin"));
    const { senseId } = await importSense();
    await approveSense(getDb(), reviewer, senseId);
    await expect(publishApproved(getDb(), reviewer)).rejects.toMatchObject({ status: 403 });
    expect(await statusOf(senseId)).toBe("approved");

    const result = await publishApproved(getDb(), admin);
    expect(result.senses).toBeGreaterThanOrEqual(1);
    const v = await senseForReview(getDb(), senseId, admin.id);
    expect([v.sense.status, v.lemma.status, v.examples[0]!.status]).toEqual([
      "live",
      "live",
      "live",
    ]);
    const live = await getDb()
      .select({ s: lemma.status })
      .from(lemma)
      .where(eq(lemma.id, v.lemma.id));
    expect(live[0]!.s).toBe("live");
  });

  it("drops the audio of a sentence that changed", async () => {
    const r = await reviewerFor(await makeUser("admin"));
    const { senseId } = await importSense();
    const edit = await editOf(senseId, r.id);
    edit.examples[0]!.text = "Tu perro come.";
    await editSense(getDb(), r, senseId, edit);
    const { audio } = await import("@/lib/db/schema");
    const [ex] = await getDb().select().from(example).where(eq(example.senseId, senseId));
    const rows = await getDb().select().from(audio).where(eq(audio.exampleId, ex!.id));
    expect(rows.map((a) => a.status)).toEqual(["retired"]);
  });
});

describe("pseudowords", () => {
  it("approves checked words and retires rejected ones", async () => {
    const r = await reviewerFor(await makeUser("teacher", { canReview: true }));
    const [a, b] = await getDb()
      .insert(pseudoword)
      .values([{ text: `zq${uniq()}` }, { text: `zr${uniq()}` }])
      .returning({ id: pseudoword.id });
    await decidePseudowords(getDb(), r, [a!.id], "approve");
    await decidePseudowords(getDb(), r, [b!.id], "reject");
    const rows = await getDb().select().from(pseudoword).where(eq(pseudoword.id, a!.id));
    const rejected = await getDb().select().from(pseudoword).where(eq(pseudoword.id, b!.id));
    expect([rows[0]!.status, rejected[0]!.status]).toEqual(["approved", "retired"]);
  });
});

describe("the queue", () => {
  it("filters by the check that failed and finds the next sense", async () => {
    const a = await importSense("draft");
    const b = await importSense("draft");
    const flagged = await reviewQueue(getDb(), { status: "draft", check: "reviewer", limit: 500 });
    expect(flagged.rows.map((r) => r.senseId)).toEqual(
      expect.arrayContaining([a.senseId, b.senseId]),
    );
    const none = await reviewQueue(getDb(), { status: "draft", check: "no-such-check" });
    expect(none.total).toBe(0);
    expect(await checkCounts(getDb(), "draft")).toEqual(
      expect.arrayContaining([{ check: "reviewer", n: expect.any(Number) }]),
    );

    const [first, second] = [a, b].sort((x, y) => (x.key < y.key ? -1 : 1));
    const next = await nextInQueue(getDb(), {
      status: "draft",
      frequencyRank: 300,
      key: first!.key,
    });
    expect(next).not.toBeNull();
    const after = await nextInQueue(getDb(), {
      status: "live",
      frequencyRank: 300,
      key: second!.key,
    });
    expect(after).toBeNull();
  });
});
