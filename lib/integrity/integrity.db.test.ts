import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { answerEvent, answerFlag, issuedQuestion, user } from "@/lib/db/schema";
import { minutesByStudent } from "@/lib/teacher/stats";
import * as svc from "@/lib/train/service";
import type { IssuedPayload, Screen } from "@/lib/train/types";
import { seedFixtureContent } from "@/test/seed-content";
import { INTEGRITY_CONFIG } from "./config";

// Spec, Phase 6 "done when": scripted fast-clicker and idle tests produce the expected flags.
// (The idle pause is in the browser; e2e/integrity.spec.ts covers it.)

beforeAll(async () => {
  await seedFixtureContent();
}, 60_000);

afterAll(async () => {
  await getSql().end();
});

async function learner(): Promise<string> {
  const id = `test-${randomUUID()}`;
  await getDb()
    .insert(user)
    .values({ id, name: id, email: `${id}@learners.invalid`, role: "learner" });
  return id;
}

/** A scripted student: answers every question `stepMs` after it appears. */
async function script(opts: {
  stepMs: number;
  answers: number;
  pick: (
    q: NonNullable<IssuedPayload["question"]>,
    i: number,
  ) => { chosenIndex?: number; typed?: string };
  hiddenReturnMs?: number | null;
}) {
  const userId = await learner();
  let now = Date.now();
  const clock = () => new Date(now);
  const notes: (string | null)[] = [];
  let { screen } = await svc.startSession(userId, { audio: false, minutes: 60 }, clock);
  let answered = 0;
  while (screen.kind !== "done" && answered < opts.answers) {
    now += opts.stepMs;
    if (screen.kind === "intro") {
      screen = (
        await svc.chooseIntro(
          userId,
          { questionId: screen.id, choice: "got_it", activeMs: opts.stepMs },
          clock,
        )
      ).next;
      continue;
    }
    const [row] = await getDb()
      .select()
      .from(issuedQuestion)
      .where(eq(issuedQuestion.id, screen.id));
    const q = (row!.payload as IssuedPayload).question!;
    const res = await svc.answerQuestion(
      userId,
      {
        questionId: screen.id,
        token: (screen as Extract<Screen, { kind: "question" }>).token,
        clientAnswerId: randomUUID(),
        ...opts.pick(q, answered),
        responseMs: opts.stepMs,
        activeMs: opts.stepMs,
        hiddenReturnMs: opts.hiddenReturnMs ?? null,
      },
      clock,
    );
    notes.push(res.feedback.integrityNote);
    screen = res.next;
    answered += 1;
  }
  const flags = await getDb()
    .select({ reason: answerFlag.reason })
    .from(answerFlag)
    .innerJoin(answerEvent, eq(answerFlag.answerEventId, answerEvent.id))
    .where(eq(answerEvent.userId, userId));
  return { userId, notes, flags };
}

const always = (index: number) => (q: NonNullable<IssuedPayload["question"]>) =>
  q.mode === "choice" ? { chosenIndex: Math.min(index, q.options!.length - 1) } : { typed: "x" };
const right = (q: NonNullable<IssuedPayload["question"]>) =>
  q.mode === "choice" ? { chosenIndex: q.correctIndex! } : { typed: q.expected! };

describe("flagged time", () => {
  it("flags a fast clicker and tells them once, gently", async () => {
    const r = await script({ stepMs: 400, answers: 20, pick: always(0) });
    expect(r.flags.length).toBeGreaterThan(3);
    expect(r.flags.some((f) => f.reason === "fast")).toBe(true);
    const shown = r.notes.filter((n) => n !== null);
    expect(shown[0]).toBe(INTEGRITY_CONFIG.studentNote);
    expect(shown.length).toBeLessThan(r.notes.length);

    const m = (
      await minutesByStudent([r.userId], {
        start: new Date(0),
        end: new Date(Date.now() + 86_400_000),
      })
    ).get(r.userId)!;
    expect(m.flaggedMs).toBeGreaterThan(0);
  });

  it("does not flag an honest student", async () => {
    const r = await script({ stepMs: 5000, answers: 20, pick: right });
    expect(r.flags).toEqual([]);
    expect(r.notes.every((n) => n === null)).toBe(true);
  });

  it("flags answers given right after coming back to a hidden tab", async () => {
    const r = await script({ stepMs: 5000, answers: 3, pick: right, hiddenReturnMs: 800 });
    expect(r.flags.map((f) => f.reason)).toContain("hidden_tab");
  });
});

describe("server-side checks", () => {
  async function firstQuestion() {
    const userId = await learner();
    let now = Date.now();
    const clock = () => new Date(now);
    let { screen } = await svc.startSession(userId, { audio: false }, clock);
    while (screen.kind === "intro") {
      now += 5000;
      screen = (
        await svc.chooseIntro(
          userId,
          { questionId: screen.id, choice: "got_it", activeMs: 4000 },
          clock,
        )
      ).next;
    }
    if (screen.kind !== "question") throw new Error("expected a question");
    return { userId, screen, clock, advance: (ms: number) => (now += ms) };
  }

  it("refuses an answer impossibly soon after its question was issued", async () => {
    const { userId, screen, clock, advance } = await firstQuestion();
    advance(100);
    await expect(
      svc.answerQuestion(
        userId,
        {
          questionId: screen.id,
          token: screen.token,
          clientAnswerId: randomUUID(),
          chosenIndex: 0,
          responseMs: 90,
          activeMs: 90,
        },
        clock,
      ),
    ).rejects.toThrow("too quickly");
  });

  it("refuses an answer without the question's signed token", async () => {
    const { userId, screen, clock, advance } = await firstQuestion();
    advance(5000);
    await expect(
      svc.answerQuestion(
        userId,
        {
          questionId: screen.id,
          token: "forged",
          clientAnswerId: randomUUID(),
          chosenIndex: 0,
          responseMs: 4000,
          activeMs: 4000,
        },
        clock,
      ),
    ).rejects.toThrow("token");
  });

  it("does not let a script claim more time than has passed", async () => {
    const { userId, screen, clock, advance } = await firstQuestion();
    advance(3000);
    const res = await svc.answerQuestion(
      userId,
      {
        questionId: screen.id,
        token: screen.token,
        clientAnswerId: randomUUID(),
        chosenIndex: 0,
        responseMs: 59_000,
        activeMs: 59_000,
        feedbackMs: 59_000,
      },
      clock,
    );
    // The time counted for this answer is what the server saw pass, not what was claimed.
    const [event] = await getDb().select().from(answerEvent).where(eq(answerEvent.userId, userId));
    expect(event!.activeMs).toBeLessThanOrEqual(3000);
    expect(event!.clientResponseMs).toBe(59_000); // the raw client value is still logged
    expect(res.activeMs).toBeLessThan(20_000);
  });
});
