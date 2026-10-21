import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { learnerProfile, placement, pseudoword } from "@/lib/db/schema";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import {
  estimatePlacement,
  newPlacement,
  nextPlacementItem,
  recordPlacementAnswer,
  type PlacementItem,
  type PlacementPool,
  type PlacementState,
} from "@/lib/engine/placement";
import { getTrainingContent } from "./content";
import { getProfile } from "./store";
import { TrainingError } from "./service";

// The placement test on the server (spec: Placement). The browser sees only the word and an
// opaque token, never whether an item is real, so it cannot tell the pseudowords apart.

type Stored = PlacementState & {
  pending: { token: string; item: PlacementItem; text: string } | null;
};
export type PlacementScreen =
  | { done: false; placementId: string; token: string; text: string; index: number; total: number }
  | { done: true; level: number; reliable: boolean };

const rng = Math.random;

/** Whether this learner still needs to place before training. Teachers never do. */
export async function needsPlacement(userId: string, role: string): Promise<boolean> {
  if (role !== "learner" && role !== "student") return false;
  const profile = await getProfile(getDb(), userId);
  return profile.placementSource === null;
}

async function pool() {
  const content = await getTrainingContent();
  // One real item per lemma (its most frequent sense), shown as the bare headword: an article
  // would mark it as a real noun.
  const byLemma = new Map<number, { id: number; rank: number; text: string }>();
  for (const s of content.senses) {
    const prev = byLemma.get(s.lemmaId);
    if (!prev || s.frequencyRank < prev.rank)
      byLemma.set(s.lemmaId, { id: s.id, rank: s.frequencyRank, text: s.headword });
  }
  const pseudo = await getDb()
    .select({ id: pseudoword.id, text: pseudoword.text })
    .from(pseudoword)
    .where(eq(pseudoword.status, "live"));
  const words = [...byLemma.values()];
  const texts = new Map<string, string>([
    ...words.map((w) => [`word:${w.id}`, w.text] as const),
    ...pseudo.map((p) => [`pseudo:${p.id}`, p.text] as const),
  ]);
  const p: PlacementPool = { words, pseudowords: pseudo.map((x) => ({ id: x.id })) };
  return { pool: p, texts };
}

function pend(state: PlacementState, item: PlacementItem, texts: Map<string, string>): Stored {
  return {
    ...state,
    pending: {
      token: randomBytes(12).toString("base64url"),
      item,
      text: texts.get(`${item.kind}:${item.id}`)!,
    },
  };
}

function screenFor(id: string, s: Stored, total: number): PlacementScreen {
  return {
    done: false,
    placementId: id,
    token: s.pending!.token,
    text: s.pending!.text,
    index: s.answers.length + 1,
    total,
  };
}

function totalFor(p: PlacementPool) {
  const c = ENGINE_CONFIG.placement;
  return Math.min(c.items, p.words.length + Math.min(c.pseudowords, p.pseudowords.length));
}

export async function startPlacement(
  userId: string,
  mode: "beginner" | "test",
  timeZone?: string,
): Promise<PlacementScreen> {
  const db = getDb();
  await getProfile(db, userId);
  const tz = timeZone ? { timeZone } : {};
  if (mode === "beginner") {
    // Spec: beginners start at level 1 with no test.
    await db
      .update(learnerProfile)
      .set({ startLevel: 1, placementSource: "beginner", placedAt: new Date(), ...tz })
      .where(eq(learnerProfile.userId, userId));
    return { done: true, level: 1, reliable: true };
  }
  if (Object.keys(tz).length)
    await db.update(learnerProfile).set(tz).where(eq(learnerProfile.userId, userId));
  const { pool: p, texts } = await pool();
  const first = nextPlacementItem(newPlacement(), p, rng);
  if (!first) throw new TrainingError(409, "no words are available for placement yet");
  const state = pend(newPlacement(), first, texts);
  const [row] = await db
    .insert(placement)
    .values({ userId, state })
    .returning({ id: placement.id });
  return screenFor(row!.id, state, totalFor(p));
}

export async function answerPlacement(
  userId: string,
  input: { placementId: string; token: string; yes: boolean },
): Promise<PlacementScreen> {
  const { pool: p, texts } = await pool();
  return getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(placement)
      .where(
        and(
          eq(placement.id, input.placementId),
          eq(placement.userId, userId),
          isNull(placement.finishedAt),
        ),
      )
      .for("update");
    if (!row) throw new TrainingError(404, "placement not found");
    const stored = row.state as Stored;
    if (!stored.pending || stored.pending.token !== input.token) {
      throw new TrainingError(409, "that item was already answered");
    }
    const state = recordPlacementAnswer(
      { answers: stored.answers },
      stored.pending.item,
      input.yes,
    );
    const next = nextPlacementItem(state, p, rng);
    if (next) {
      const s = pend(state, next, texts);
      await tx.update(placement).set({ state: s }).where(eq(placement.id, row.id));
      return screenFor(row.id, s, totalFor(p));
    }
    const result = estimatePlacement(state);
    await tx
      .update(placement)
      .set({ state: { ...state, pending: null }, finishedAt: new Date(), result })
      .where(eq(placement.id, row.id));
    await tx
      .update(learnerProfile)
      .set({
        // Placement seeds the ability score and sets the starting level (spec: Placement).
        ability: result.ability,
        startLevel: result.level,
        placementSource: "test",
        placedAt: new Date(),
      })
      .where(eq(learnerProfile.userId, userId));
    return { done: true, level: result.level, reliable: result.reliable };
  });
}
