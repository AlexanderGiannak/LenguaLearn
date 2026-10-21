import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { applyStatusChanges } from "@/lib/content/status-changes";
import { getDb, getSql } from "@/lib/db/client";
import { answerEvent, card, issuedQuestion, studySession, user } from "@/lib/db/schema";
import { clearTrainingContentCache } from "./content";
import { answerQuestion, chooseIntro, endSession, startSession } from "./service";
import type { IssuedPayload, Screen } from "./types";

// Walks real sessions through the service against the 40 fixture words.

beforeAll(async () => {
  const seed = importPayloadSchema.parse(
    JSON.parse(readFileSync("fixtures/content/seed-40.json", "utf8")),
  );
  const report = await importContent(getDb(), seed);
  const steps: Record<string, ("approved" | "live")[]> = {
    ai_checked: ["approved", "live"],
    approved: ["live"],
  };
  const changes = report.rows.flatMap((r) =>
    (steps[r.status] ?? []).map((to) => ({ table: r.table, id: r.id, to })),
  );
  if (changes.length) await applyStatusChanges(getDb(), changes);
  clearTrainingContentCache();
});

/** A learner account to train with (learner data must belong to a real user). */
async function testUser(): Promise<string> {
  const id = `test-${randomUUID()}`;
  await getDb()
    .insert(user)
    .values({ id, name: id, email: `${id}@learners.invalid`, role: "learner" });
  return id;
}

afterAll(async () => {
  await getSql().end();
});

async function payloadOf(id: string): Promise<IssuedPayload> {
  const [row] = await getDb().select().from(issuedQuestion).where(eq(issuedQuestion.id, id));
  return row!.payload as IssuedPayload;
}

/** Answers a question screen correctly, using the server's copy of the answer. */
async function answerRight(userId: string, screen: Extract<Screen, { kind: "question" }>) {
  const { question } = await payloadOf(screen.id);
  return answerQuestion(userId, {
    questionId: screen.id,
    clientAnswerId: randomUUID(),
    ...(question!.mode === "choice"
      ? { chosenIndex: question!.correctIndex! }
      : { typed: question!.expected! }),
    responseMs: 4000,
    activeMs: 5000,
  });
}

describe("training service", () => {
  it("starts with a new word and walks through the intro to its first card", async () => {
    const userId = await testUser();
    const { screen } = await startSession(userId, { audio: false });
    let current = screen;
    if (current.kind === "question") {
      expect(current.stage).toBe("pretest"); // guess-first word
      current = (await answerRight(userId, current)).next;
    }
    expect(current.kind).toBe("intro");
    if (current.kind !== "intro") return;
    const senseId = current.word.senseId;

    const { next } = await chooseIntro(userId, {
      questionId: current.id,
      choice: "got_it",
      activeMs: 8000,
    });
    expect(next).toMatchObject({ kind: "question", stage: "intro_check" });
    if (next.kind !== "question") return;
    expect(next.question.options).toHaveLength(4);
    expect(JSON.stringify(next.question)).not.toContain("correctIndex");

    const res = await answerRight(userId, next);
    expect(res.feedback).toMatchObject({ correct: true, grade: "correct" });
    const cards = await getDb()
      .select()
      .from(card)
      .where(and(eq(card.userId, userId), eq(card.senseId, senseId)));
    expect(cards.map((c) => c.kind)).toEqual(["recognition"]);
  });

  it("logs every graded answer and replays a retried answer without counting it twice", async () => {
    const userId = await testUser();
    let { screen } = await startSession(userId, { audio: false });
    while (screen.kind === "intro") {
      screen = (
        await chooseIntro(userId, { questionId: screen.id, choice: "got_it", activeMs: 1000 })
      ).next;
    }
    if (screen.kind !== "question") throw new Error("expected a question");
    const { question } = await payloadOf(screen.id);
    const input = {
      questionId: screen.id,
      clientAnswerId: randomUUID(),
      chosenIndex: (question!.correctIndex! + 1) % 4,
      responseMs: 3000,
      activeMs: 4000,
    };
    const first = await answerQuestion(userId, input);
    const retry = await answerQuestion(userId, input);
    expect(retry).toEqual(first);
    expect(first.feedback.correct).toBe(false);
    expect(first.feedback.requiredReadMs).toBe(3000);

    const events = await getDb().select().from(answerEvent).where(eq(answerEvent.userId, userId));
    expect(events).toHaveLength(1);
    await expect(
      answerQuestion(userId, { ...input, clientAnswerId: randomUUID() }),
    ).rejects.toThrow("already answered");
  });

  it("ends the session after the current question once time is up, with a summary", async () => {
    const userId = await testUser();
    const start = await startSession(userId, { audio: false, minutes: 1 });
    let screen = start.screen;
    let steps = 0;
    while (screen.kind !== "done" && steps < 40) {
      steps += 1;
      screen =
        screen.kind === "intro"
          ? (
              await chooseIntro(userId, {
                questionId: screen.id,
                choice: "got_it",
                activeMs: 20_000,
              })
            ).next
          : (await answerRight(userId, screen)).next;
    }
    expect(screen.kind).toBe("done");
    const summary = await endSession(userId, start.sessionId);
    expect(summary.questions).toBeGreaterThan(0);
    expect(summary.accuracy).toBe(100);
    expect(summary.newWords).toBeGreaterThan(0);
    expect(summary.activeMinutes).toBeGreaterThanOrEqual(1);
    const [session] = await getDb()
      .select()
      .from(studySession)
      .where(eq(studySession.id, start.sessionId));
    expect(session!.endedAt).not.toBeNull();
  });

  it("caps each screen's counted time", async () => {
    const userId = await testUser();
    const { screen } = await startSession(userId, { audio: false });
    const res =
      screen.kind === "intro"
        ? await chooseIntro(userId, { questionId: screen.id, choice: "got_it", activeMs: 600_000 })
        : await answerRight(userId, screen as Extract<Screen, { kind: "question" }>);
    expect(res.activeMs).toBeLessThanOrEqual(90_000);
  });

  it("refuses another user's question", async () => {
    const owner = await testUser();
    const { screen } = await startSession(owner, { audio: false });
    if (screen.kind === "done") throw new Error("expected a screen");
    await expect(
      chooseIntro(await testUser(), { questionId: screen.id, choice: "got_it", activeMs: 0 }),
    ).rejects.toThrow("not found");
  });

  it("logs Easy and the production card when I already know this is answered right", async () => {
    const userId = await testUser();
    let { screen } = await startSession(userId, { audio: false });
    while (screen.kind === "question" && screen.stage === "pretest") {
      screen = (await answerRight(userId, screen)).next;
    }
    if (screen.kind !== "intro") throw new Error("expected a word page");
    const { next } = await chooseIntro(userId, {
      questionId: screen.id,
      choice: "already_know",
      activeMs: 1000,
    });
    if (next.kind !== "question") throw new Error("expected a question");
    expect(next.stage).toBe("intro_known");
    await answerRight(userId, next);
    const [event] = await getDb()
      .select()
      .from(answerEvent)
      .where(and(eq(answerEvent.userId, userId), eq(answerEvent.isPretest, false)));
    expect(event).toMatchObject({ rating: 4, cardKind: "production", correct: true });
    expect((event!.fsrsAfter as { reps: number }).reps).toBe(1);
  });

  it("counts the last screen's time when the session ends", async () => {
    const userId = await testUser();
    const { sessionId } = await startSession(userId, { audio: false });
    const summary = await endSession(userId, sessionId, 42_000);
    expect(summary.activeMinutes).toBeCloseTo(0.7, 1);
    // Ending twice adds nothing more.
    expect((await endSession(userId, sessionId, 42_000)).activeMinutes).toBeCloseTo(0.7, 1);
  });
});

describe("answer_event", () => {
  it("is append-only: updates other than clearing typed text are refused", async () => {
    const [row] = await getDb().select().from(answerEvent).limit(1);
    expect(row).toBeDefined();
    await expect(
      getDb()
        .update(answerEvent)
        .set({ correct: !row!.correct })
        .where(eq(answerEvent.id, row!.id)),
    ).rejects.toThrow();
    await getDb().update(answerEvent).set({ typedText: null }).where(eq(answerEvent.id, row!.id));
    const [count] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(answerEvent)
      .where(eq(answerEvent.id, row!.id));
    expect(count!.n).toBe(1);
  });
});
