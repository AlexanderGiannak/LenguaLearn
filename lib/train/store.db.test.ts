import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { getDb, getSql } from "@/lib/db/client";
import { sense, senseProgress, user } from "@/lib/db/schema";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { newSenseMemory } from "@/lib/engine/cards";
import { saveProgress } from "./store";

// The 40 fixture words provide real sense rows for the foreign key.
let senseId: number;

beforeAll(async () => {
  const seed = importPayloadSchema.parse(
    JSON.parse(readFileSync("fixtures/content/seed-40.json", "utf8")),
  );
  await importContent(getDb(), seed);
  const [s] = await getDb().select({ id: sense.id }).from(sense).limit(1);
  senseId = s!.id;
});

afterAll(async () => {
  await getSql().end();
});

async function testUser(): Promise<string> {
  const id = `test-${randomUUID()}`;
  await getDb()
    .insert(user)
    .values({ id, name: id, email: `${id}@learners.invalid`, role: "learner" });
  return id;
}

async function firstLearnedAt(userId: string) {
  const [row] = await getDb()
    .select({ at: senseProgress.firstLearnedAt })
    .from(senseProgress)
    .where(and(eq(senseProgress.userId, userId), eq(senseProgress.senseId, senseId)));
  return row!.at;
}

describe("saveProgress", () => {
  it("records the first time a word meets the learned interval, and never moves it", async () => {
    const userId = await testUser();
    const t0 = new Date("2026-10-01T15:00:00Z");
    const memory = newSenseMemory(t0);
    await getDb().transaction((tx) => saveProgress(tx, userId, senseId, memory, null, t0));
    expect(await firstLearnedAt(userId)).toBeNull();

    // An existing row reaching the interval: the update path, which once failed on the Date.
    const days = ENGINE_CONFIG.learnedMinIntervalDays;
    const t1 = new Date(t0.getTime() + days * 86_400_000);
    const passed = { ...memory, bestRecognitionPassDays: days };
    await getDb().transaction((tx) => saveProgress(tx, userId, senseId, passed, null, t1));
    expect(await firstLearnedAt(userId)).toEqual(t1);

    const t2 = new Date(t1.getTime() + 86_400_000);
    await getDb().transaction((tx) => saveProgress(tx, userId, senseId, passed, null, t2));
    expect(await firstLearnedAt(userId)).toEqual(t1);
  });
});
