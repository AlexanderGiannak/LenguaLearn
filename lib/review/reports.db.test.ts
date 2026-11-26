import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { exportUserData } from "@/lib/account/data";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { applyStatusChanges } from "@/lib/content/status-changes";
import { getDb, getSql } from "@/lib/db/client";
import { contentReport, issuedQuestion, sense, studySession, user } from "@/lib/db/schema";
import { clearTrainingContentCache, getTrainingContent } from "@/lib/train/content";
import { reviewerFor } from "./access";
import {
  markReportsReviewed,
  openReports,
  pausedSenseIds,
  REPORT_CONFIG,
  submitReport,
} from "./reports";
import { approveSense, editSense, queueCounts, reviewQueue, senseForReview } from "./service";
import { senseEditSchema } from "./schema";

// TEST FIXTURE: the Spanish text below is test data, not content.

afterAll(async () => {
  await getSql().end();
});

const uniq = () => randomUUID().slice(0, 8);

/** A live sense, as learners would meet it. Ranked far down the list so the training tests,
 * which share the database, never pick it as their first new word. */
async function liveSense() {
  const p = `rp${uniq()}`;
  const report = await importContent(
    getDb(),
    importPayloadSchema.parse({
      lemmas: [
        {
          key: `${p}gato#noun`,
          headword: `${p}gato`,
          partOfSpeech: "noun",
          gender: "m",
          frequencyRank: 20000,
          status: "ai_checked",
          senses: [
            {
              key: `${p}gato#noun#1`,
              gloss: "cat",
              definition: "A small pet animal that purrs.",
              frequencyRank: 20000,
              register: "neutral",
              cognate: "none",
              concreteness: "concrete",
              status: "ai_checked",
              examples: [
                {
                  text: "El gato duerme.",
                  surfaceForm: "gato",
                  start: 3,
                  end: 7,
                  translation: "The cat sleeps.",
                  distractors: ["perro", "libro", "río"],
                  source: "ai",
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  await applyStatusChanges(
    getDb(),
    report.rows.flatMap((r) => [
      { table: r.table, id: r.id, to: "approved" as const },
      { table: r.table, id: r.id, to: "live" as const },
    ]),
  );
  return report.rows.find((r) => r.table === "sense")!.id;
}

async function learner() {
  const id = `l${uniq()}`;
  await getDb()
    .insert(user)
    .values({ id, name: id, email: `${id}@learners.invalid`, role: "learner" });
  return id;
}

/** A question the server issued to this learner about this sense. */
async function issued(userId: string, senseId: number) {
  const [s] = await getDb()
    .insert(studySession)
    .values({ userId, plannedMinutes: 5, state: {}, audio: false })
    .returning({ id: studySession.id });
  const [q] = await getDb()
    .insert(issuedQuestion)
    .values({
      studySessionId: s!.id,
      userId,
      payload: { stage: "review", senseId, item: {}, question: { type: "meaning_choice" } },
    })
    .returning({ id: issuedQuestion.id });
  return q!.id;
}

async function reportFrom(senseId: number, text?: string) {
  const id = await learner();
  await submitReport(getDb(), id, {
    questionId: await issued(id, senseId),
    reason: "wrong_meaning",
    text,
  });
  return id;
}

async function admin() {
  const id = `a${uniq()}`;
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

describe("Report a problem", () => {
  it("files the report under the sense of the learner's own question", async () => {
    const senseId = await liveSense();
    const id = await reportFrom(senseId, "  the gloss is wrong  ");
    const [row] = await getDb()
      .select()
      .from(contentReport)
      .where(eq(contentReport.reporterId, id));
    expect(row).toMatchObject({
      senseId,
      reason: "wrong_meaning",
      text: "the gloss is wrong",
      questionType: "meaning_choice",
      resolvedAt: null,
    });
  });

  it("refuses a question issued to someone else", async () => {
    const senseId = await liveSense();
    const other = await learner();
    const questionId = await issued(other, senseId);
    await expect(
      submitReport(getDb(), await learner(), { questionId, reason: "other" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("counts one learner once: a second report updates the first", async () => {
    const senseId = await liveSense();
    const id = await learner();
    for (const reason of ["wrong_meaning", "spelling"] as const) {
      await submitReport(getDb(), id, { questionId: await issued(id, senseId), reason });
    }
    const rows = await getDb().select().from(contentReport).where(eq(contentReport.reporterId, id));
    expect(rows.map((r) => r.reason)).toEqual(["spelling"]);
  });

  it("caps how many reports one learner sends in a day", async () => {
    const id = await learner();
    const at = new Date();
    for (let i = 0; i < REPORT_CONFIG.perDay; i++) {
      await getDb()
        .insert(contentReport)
        .values({ senseId: await liveSense(), reporterId: id, reason: "other", at });
    }
    const senseId = await liveSense();
    await expect(
      submitReport(getDb(), id, { questionId: await issued(id, senseId), reason: "other" }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("pauses a sense for new learners at 3 reports from different learners", async () => {
    const senseId = await liveSense();
    await reportFrom(senseId);
    await reportFrom(senseId);
    expect((await pausedSenseIds(getDb())).has(senseId)).toBe(false);
    await reportFrom(senseId);
    expect((await pausedSenseIds(getDb())).has(senseId)).toBe(true);
    clearTrainingContentCache();
    const content = await getTrainingContent();
    expect(content.paused.has(senseId)).toBe(true);
    // Still live, so learners who have it keep reviewing it.
    expect(content.byId.has(senseId)).toBe(true);
  });

  it("is deleted with the learner's account and included in their export", async () => {
    const senseId = await liveSense();
    const id = await reportFrom(senseId, "fixture note");
    const exported = await exportUserData(id);
    expect(exported.problemReports).toEqual([
      expect.objectContaining({ senseId, reason: "wrong_meaning", text: "fixture note" }),
    ]);
    await getDb().delete(user).where(eq(user.id, id));
    expect(
      await getDb().select().from(contentReport).where(eq(contentReport.reporterId, id)),
    ).toEqual([]);
  });
});

describe("reviewing reports", () => {
  it("lists reported senses and shows reports without who sent them", async () => {
    const senseId = await liveSense();
    await reportFrom(senseId, "fixture text");
    const queue = await reviewQueue(getDb(), { status: "reported", limit: 500 });
    expect(queue.rows.some((r) => r.senseId === senseId)).toBe(true);
    expect((await queueCounts(getDb())).reported).toBeGreaterThan(0);
    const reports = await openReports(getDb(), senseId);
    expect(reports).toHaveLength(1);
    expect(Object.keys(reports[0]!).sort()).toEqual(["at", "questionType", "reason", "text"]);
  });

  it("marking them reviewed closes them and un-pauses the sense", async () => {
    const reviewer = await admin();
    const senseId = await liveSense();
    for (let i = 0; i < 3; i++) await reportFrom(senseId);
    expect(await markReportsReviewed(getDb(), reviewer, senseId)).toEqual({ resolved: 3 });
    expect((await pausedSenseIds(getDb())).has(senseId)).toBe(false);
    const queue = await reviewQueue(getDb(), { status: "reported", limit: 500 });
    expect(queue.rows.some((r) => r.senseId === senseId)).toBe(false);
    await expect(markReportsReviewed(getDb(), reviewer, senseId)).rejects.toMatchObject({
      status: 409,
    });
    const v = await senseForReview(getDb(), senseId, reviewer.id);
    expect(v.log[0]).toMatchObject({ action: "resolve_reports", byYou: true });
  });

  it("approving a fix closes the sense's reports", async () => {
    const reviewer = await admin();
    const senseId = await liveSense();
    await reportFrom(senseId);
    const v = await senseForReview(getDb(), senseId, reviewer.id);
    await editSense(
      getDb(),
      reviewer,
      senseId,
      senseEditSchema.parse({
        loadedAt: v.sense.updatedAt.toISOString(),
        gloss: "cat (fixed)",
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
        hooks: [],
        relations: [],
        misuses: [],
      }),
    );
    await approveSense(getDb(), reviewer, senseId);
    expect(await openReports(getDb(), senseId)).toEqual([]);
    const [s] = await getDb().select().from(sense).where(eq(sense.id, senseId));
    expect(s!.status).toBe("approved");
  });
});
