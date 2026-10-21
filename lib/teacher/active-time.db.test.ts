import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { issuedQuestion, user } from "@/lib/db/schema";
import { authSecret } from "@/lib/auth/auth";
import { signQuestionToken } from "@/lib/integrity/server";
import * as svc from "@/lib/train/service";
import { seedFixtureContent } from "@/test/seed-content";
import { minutesByStudent } from "./stats";

beforeAll(async () => {
  await seedFixtureContent();
}, 60_000);

afterAll(async () => {
  await getSql().end();
});

it("counts practice in the week it happened, even when a session crosses the reset", async () => {
  const userId = `test-${randomUUID()}`;
  await getDb()
    .insert(user)
    .values({ id: userId, name: userId, email: `${userId}@learners.invalid`, role: "learner" });
  const reset = new Date("2026-10-26T04:59:00Z"); // Sunday 11:59 pm, Chicago
  let now = reset.getTime() - 60_000; // the session starts a minute before the reset
  const clock = () => new Date(now);
  let { screen } = await svc.startSession(userId, { audio: false, minutes: 30 }, clock);
  for (let i = 0; i < 6 && screen.kind !== "done"; i++) {
    now += 20_000; // three steps before the reset, three after
    if (screen.kind === "intro") {
      screen = (
        await svc.chooseIntro(
          userId,
          { questionId: screen.id, choice: "got_it", activeMs: 20_000 },
          clock,
        )
      ).next;
    } else {
      const [row] = await getDb()
        .select()
        .from(issuedQuestion)
        .where(eq(issuedQuestion.id, screen.id));
      screen = (
        await svc.answerQuestion(
          userId,
          {
            questionId: screen.id,
            token: signQuestionToken(row!.id, row!.issuedAt, authSecret()),
            clientAnswerId: randomUUID(),
            dontKnow: true,
            responseMs: 20_000,
            activeMs: 20_000,
          },
          clock,
        )
      ).next;
    }
  }
  const before = (await minutesByStudent([userId], { start: new Date(0), end: reset })).get(
    userId,
  )!;
  const after = (
    await minutesByStudent([userId], {
      start: reset,
      end: new Date(reset.getTime() + 7 * 86_400_000),
    })
  ).get(userId)!;
  expect(before.activeMs).toBe(40_000); // the two steps finished before 11:59 pm
  expect(after.activeMs).toBe(80_000);
});
