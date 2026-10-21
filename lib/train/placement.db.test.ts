import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, getSql } from "@/lib/db/client";
import { issuedQuestion, learnerProfile, placement, user } from "@/lib/db/schema";
import { seedFixtureContent } from "@/test/seed-content";
import { getTrainingContent } from "./content";
import { answerPlacement, needsPlacement, startPlacement, type PlacementScreen } from "./placement";
import * as svc from "./service";
import type { IssuedPayload } from "./types";

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

/** Takes the test as someone who knows real words up to `knownRank` and rejects pseudowords. */
async function takeTest(userId: string, knownRank: number) {
  const content = await getTrainingContent();
  let screen: PlacementScreen = await startPlacement(userId, "test", "America/Chicago");
  let asked = 0;
  while (!screen.done) {
    asked += 1;
    const [row] = await getDb()
      .select()
      .from(placement)
      .where(eq(placement.id, screen.placementId));
    const item = (row!.state as { pending: { item: { kind: string; id: number } } }).pending.item;
    const yes = item.kind === "word" && content.byId.get(item.id)!.frequencyRank <= knownRank;
    screen = await answerPlacement(userId, {
      placementId: screen.placementId,
      token: screen.token,
      yes,
    });
  }
  return { screen, asked };
}

describe("placement", () => {
  it("a total beginner starts at level 1 with no test", async () => {
    const id = await learner();
    expect(await needsPlacement(id, "learner")).toBe(true);
    expect(await startPlacement(id, "beginner")).toEqual({ done: true, level: 1, reliable: true });
    expect(await needsPlacement(id, "learner")).toBe(false);
  });

  it("teachers never need placement", async () => {
    expect(await needsPlacement(await learner(), "teacher")).toBe(false);
  });

  it("a learner who knows the common words places above level 1 and has their ability seeded", async () => {
    const id = await learner();
    const { screen, asked } = await takeTest(id, 2000);
    expect(asked).toBeGreaterThanOrEqual(40); // 40 words plus 10 pseudowords, capped at 40 items
    expect(screen.done && screen.level).toBeGreaterThan(1);
    const [p] = await getDb().select().from(learnerProfile).where(eq(learnerProfile.userId, id));
    expect(p).toMatchObject({ placementSource: "test" });
    expect(p!.ability).toBeGreaterThan(Math.log(500));
  });

  it("checks probably-known words below the starting level instead of teaching them", async () => {
    const id = await learner();
    const { screen } = await takeTest(id, 2000);
    const level = screen.done ? screen.level : 1;
    const content = await getTrainingContent();
    const first = await svc.startSession(id, { audio: false });
    expect(first.screen.kind).toBe("question");
    if (first.screen.kind !== "question") return;
    expect(first.screen.stage).toBe("intro_known");
    const [row] = await getDb()
      .select()
      .from(issuedQuestion)
      .where(eq(issuedQuestion.id, first.screen.id));
    const senseId = (row!.payload as IssuedPayload).senseId;
    expect(content.byId.get(senseId)!.frequencyRank).toBeLessThan((level - 1) * 500 + 1);
  });

  it("refuses an answer to an item that was already answered", async () => {
    const id = await learner();
    const first = await startPlacement(id, "test");
    if (first.done) throw new Error("expected an item");
    await answerPlacement(id, { placementId: first.placementId, token: first.token, yes: true });
    await expect(
      answerPlacement(id, { placementId: first.placementId, token: first.token, yes: true }),
    ).rejects.toThrow("already answered");
  });
});
