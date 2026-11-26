import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { applyStatusChanges } from "@/lib/content/status-changes";
import { getDb, getSql } from "@/lib/db/client";
import { contentFlag, studySession, user } from "@/lib/db/schema";
import { reviewerFor } from "./access";
import { markFlagsReviewed } from "./flags";
import { queueCounts, reviewQueue, senseForReview } from "./service";
import { runStatsJob } from "./stats-job";

// TEST FIXTURE: the Spanish text below is test data, not content.
//
// The answers here are dated in December of a random far-future year and the job runs
// "on 1 January" after it, so answers from other tests (and earlier runs of this one, since
// the test database is kept) fall outside its 60-day window: every baseline is this run's.

const YEAR = 2100 + randomInt(0, 5000);
/** A date in this run's December, or in the January after it ("01-25"). */
const day = (md: string) => new Date(`${md.startsWith("01") ? YEAR + 1 : YEAR}-${md}T12:00:00Z`);
const NIGHT = day("01-01");
const OPTIONS = JSON.stringify([
  { text: "right", senseId: 0 },
  { text: "fixture-a", senseId: 0 },
  { text: "fixture-b", senseId: 0 },
  { text: "fixture-c", senseId: 0 },
]);
const GENDER = JSON.stringify([{ text: "la" }, { text: "el" }]);

let userId = "";
let sessionId = "";
let ids: Record<string, number> = {};

afterAll(async () => {
  await getSql().end();
});

beforeAll(async () => {
  const p = `sj${randomUUID().slice(0, 6)}`;
  const names = [
    ...Array.from({ length: 12 }, (_, i) => `ok${i}`),
    ...["bad", "magnet", "slow", "gen", "inflated", "streak"],
  ];
  const report = await importContent(
    getDb(),
    importPayloadSchema.parse({
      lemmas: names.map((n, i) => ({
        key: `${p}${n}#noun`,
        headword: `${p}${n}`,
        partOfSpeech: "noun",
        gender: "m",
        frequencyRank: 30_001 + i,
        status: "ai_checked",
        senses: [
          {
            key: `${p}${n}#noun#1`,
            gloss: `fixture ${n}`,
            definition: "A fixture word for the stats job test.",
            frequencyRank: 30_001 + i,
            register: "neutral",
            cognate: "none",
            concreteness: "concrete",
            status: "ai_checked",
            examples: [
              {
                text: `Un ${p}${n} aquí.`,
                surfaceForm: `${p}${n}`,
                start: 3,
                end: 3 + `${p}${n}`.length,
                translation: "A fixture here.",
                distractors: ["perro", "libro", "río"],
                source: "ai",
              },
            ],
          },
        ],
      })),
    }),
  );
  await applyStatusChanges(
    getDb(),
    report.rows.flatMap((r) => [
      { table: r.table, id: r.id, to: "approved" as const },
      { table: r.table, id: r.id, to: "live" as const },
    ]),
  );
  const senses = report.rows.filter((r) => r.table === "sense");
  ids = Object.fromEntries(
    names.map((n) => [n, senses.find((s) => s.key === `${p}${n}#noun#1`)!.id]),
  );

  userId = `sj${randomUUID().slice(0, 8)}`;
  await getDb()
    .insert(user)
    .values({ id: userId, name: userId, email: `${userId}@learners.invalid`, role: "learner" });
  const [s] = await getDb()
    .insert(studySession)
    .values({ userId, plannedMinutes: 5, state: {}, audio: false })
    .returning({ id: studySession.id });
  sessionId = s!.id;

  for (let i = 0; i < 12; i++) await answers(ids[`ok${i}`]!, { right: 32 });
  await answers(ids.bad!, { right: 12 });
  // 28 right, 12 wrong: 9 pick fixture-a, and so does 1 of the 3 spread over the options.
  await answers(ids.magnet!, { right: 28, magnet: 9 });
  await answers(ids.slow!, { right: 32, ms: 12_000 });
  // A two-option question: its one wrong option takes every wrong pick, which says nothing.
  await answers(ids.gen!, { right: 24, type: "gender_choice", options: GENDER });
  // The client claims 12 seconds, but the server saw about 4: training would count 4.
  await answers(ids.inflated!, { right: 32, ms: 12_000, serverMs: 4_000 });
  // Answered badly, but the streak rules flagged every answer afterwards (answer_flag).
  await answers(ids.streak!, { right: 8 });
  await getSql()`insert into answer_flag (answer_event_id, reason)
    select id, 'same_position' from answer_event where sense_id = ${ids.streak!}`;
});

/** 40 answers to a sense: `right` of them right, the wrong ones spread over the options. */
async function answers(
  senseId: number,
  o: {
    right: number;
    magnet?: number;
    ms?: number;
    type?: string;
    options?: string;
    at?: Date;
    /** Issue-to-receive time on the server; by default what the client reports. */
    serverMs?: number;
  },
) {
  const sql = getSql();
  const at = (o.at ?? day("12-15")).toISOString();
  await sql`
    insert into answer_event (client_answer_id, user_id, sense_id, study_session_id,
      question_type, options, chosen_index, grade, correct, fsrs_params_version,
      client_response_ms, server_issued_at, server_received_at, app_version)
    select gen_random_uuid(), ${userId}, ${senseId}, ${sessionId},
      ${o.type ?? "meaning_choice"}, ${o.options ?? OPTIONS}::jsonb,
      case when g <= ${o.right} then 0
           when ${o.options ?? OPTIONS}::jsonb = ${GENDER}::jsonb then 1
           when g - ${o.right} <= ${o.magnet ?? 0} then 1
           else 1 + (g % 3) end,
      case when g <= ${o.right} then 'right' else 'wrong' end,
      g <= ${o.right}, 'fixture', ${o.ms ?? 4000} + (g % 7) * 100,
      ${at}::timestamptz - make_interval(secs => (${o.serverMs ?? o.ms ?? 4000} + (g % 7) * 100) / 1000.0),
      ${at}::timestamptz, 'test'
    from generate_series(1, 40) g`;
}

async function openFlagKinds() {
  const rows = await getDb().select().from(contentFlag);
  const bySense = new Map(Object.entries(ids).map(([n, id]) => [id, n]));
  return rows
    .filter((r) => r.resolvedAt === null && bySense.has(r.senseId))
    .map((r) => `${bySense.get(r.senseId)}:${r.kind}`)
    .sort();
}

async function admin() {
  const id = `a${randomUUID().slice(0, 8)}`;
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

// Queue checks read the whole queue: the local test database keeps rows between runs.
describe("nightly stats job", () => {
  it("flags low accuracy, a magnet distractor and slow answers, and nothing ordinary", async () => {
    const r = await runStatsJob(getSql(), NIGHT);
    expect(r.raised).toBe(3);
    expect(await openFlagKinds()).toEqual([
      "bad:low_accuracy",
      "magnet:distractor_magnet",
      "slow:slow",
    ]);
    const [magnet] = await getDb()
      .select()
      .from(contentFlag)
      .where(eq(contentFlag.senseId, ids.magnet!));
    expect(magnet!.detail).toEqual({
      option: "fixture-a",
      questionType: "meaning_choice",
      share: 0.83,
      wrongPicks: 12,
    });
  });

  it("updates open flags on the next run instead of adding more", async () => {
    const r = await runStatsJob(getSql(), NIGHT);
    expect(r).toMatchObject({ raised: 0, updated: 3 });
    expect(await openFlagKinds()).toHaveLength(3);
  });

  it("puts flagged senses in the review queue with their numbers", async () => {
    const reviewer = await admin();
    const queue = await reviewQueue(getDb(), { status: "flagged", limit: 1_000_000 });
    expect(queue.rows.map((r) => r.senseId)).toEqual(
      expect.arrayContaining([ids.bad, ids.magnet, ids.slow]),
    );
    expect((await queueCounts(getDb())).flagged).toBeGreaterThanOrEqual(3);
    const v = await senseForReview(getDb(), ids.bad!, reviewer.id);
    expect(v.flags).toEqual([
      expect.objectContaining({
        kind: "low_accuracy",
        detail: { accuracy: 0.3, expected: 0.79, answers: 40 },
      }),
    ]);
  });

  it("after a review, counts only newer answers and waits before raising it again", async () => {
    const reviewer = await admin();
    expect(await markFlagsReviewed(getDb(), reviewer, ids.bad!)).toEqual({ resolved: 1 });
    await expect(markFlagsReviewed(getDb(), reviewer, ids.bad!)).rejects.toMatchObject({
      status: 409,
    });
    // As if the reviewer had closed it on 20 December, after those answers.
    await getSql()`update content_flag set resolved_at = ${day("12-20").toISOString()}::timestamptz
      where sense_id = ${ids.bad!}`;
    expect((await runStatsJob(getSql(), NIGHT)).raised).toBe(0);
    expect(await openFlagKinds()).not.toContain("bad:low_accuracy");

    // Still answered badly after the review: held back for 30 days, then raised again.
    await answers(ids.bad!, { right: 12, at: day("12-25") });
    expect(await runStatsJob(getSql(), NIGHT)).toMatchObject({ raised: 0, quiet: 1 });
    expect((await runStatsJob(getSql(), day("01-25"))).raised).toBe(1);
    expect(await openFlagKinds()).toContain("bad:low_accuracy");
  });
});
