import { and, eq, sql } from "drizzle-orm";
import type { Card } from "ts-fsrs";
import type { getDb } from "@/lib/db/client";
import { card, learnerProfile, senseProgress } from "@/lib/db/schema";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import type { CardKind, SenseMemory } from "@/lib/engine/cards";
import type { QuestionType } from "@/lib/engine/questions";

// Moves the engine's in-memory card state to and from Postgres.

type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type CardRow = typeof card.$inferSelect;

export function toCard(row: CardRow): Card {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.lastReview ?? undefined,
  };
}

function cardValues(c: Card) {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: c.last_review ?? null,
  };
}

export type Progress = { memory: SenseMemory; lastType: QuestionType | null };

/** Every studied sense for a user. A few hundred rows; read once per question. */
export async function loadProgress(db: Db | Tx, userId: string): Promise<Map<number, Progress>> {
  const [progress, cards] = await Promise.all([
    db.select().from(senseProgress).where(eq(senseProgress.userId, userId)),
    db.select().from(card).where(eq(card.userId, userId)),
  ]);
  const out = new Map<number, Progress>();
  for (const p of progress) {
    const recognition = cards.find((c) => c.senseId === p.senseId && c.kind === "recognition");
    if (!recognition) continue;
    const production = cards.find((c) => c.senseId === p.senseId && c.kind === "production");
    out.set(p.senseId, {
      memory: {
        recognition: toCard(recognition),
        production: production ? toCard(production) : null,
        bestRecognitionPassDays: p.bestRecognitionPassDays,
      },
      lastType: (p.lastQuestionType as QuestionType | null) ?? null,
    });
  }
  return out;
}

export async function saveProgress(
  tx: Tx,
  userId: string,
  senseId: number,
  memory: SenseMemory,
  lastType: QuestionType | null,
  now: Date = new Date(),
): Promise<void> {
  // The first time the learned rule's interval part is met (the recall part is ~1 right
  // after a passed review), keep that moment; later saves never move it.
  const learnedNow =
    memory.bestRecognitionPassDays >= ENGINE_CONFIG.learnedMinIntervalDays ? now : null;
  await tx
    .insert(senseProgress)
    .values({
      userId,
      senseId,
      bestRecognitionPassDays: memory.bestRecognitionPassDays,
      lastQuestionType: lastType,
      firstLearnedAt: learnedNow,
    })
    .onConflictDoUpdate({
      target: [senseProgress.userId, senseProgress.senseId],
      set: {
        bestRecognitionPassDays: memory.bestRecognitionPassDays,
        lastQuestionType: lastType,
        firstLearnedAt: sql`coalesce(${senseProgress.firstLearnedAt}, ${learnedNow})`,
      },
    });
  for (const kind of ["recognition", "production"] as const satisfies CardKind[]) {
    const c = memory[kind];
    if (!c) continue;
    await tx
      .insert(card)
      .values({ userId, senseId, kind, ...cardValues(c) })
      .onConflictDoUpdate({ target: [card.userId, card.senseId, card.kind], set: cardValues(c) });
  }
}

/** The learner's profile, created on first use. */
export async function getProfile(db: Db | Tx, userId: string) {
  const [existing] = await db
    .select()
    .from(learnerProfile)
    .where(eq(learnerProfile.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(learnerProfile)
    .values({ userId, ability: ENGINE_CONFIG.ability.beginnerAbility })
    .onConflictDoNothing()
    .returning();
  return (
    created ??
    (
      await db
        .select()
        .from(learnerProfile)
        .where(and(eq(learnerProfile.userId, userId)))
    )[0]!
  );
}
