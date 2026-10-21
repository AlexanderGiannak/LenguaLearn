import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { articleFor } from "@/lib/content/display";
import { getDb } from "@/lib/db/client";
import { audio, example, lemma, relation, sense, wordPart } from "@/lib/db/schema";
import { normalizeAnswer } from "@/lib/engine/answer-check";
import type { EngineSense } from "@/lib/engine/types";

// Live content in the engine's shapes, cached per server process. Content changes rarely
// (through review), so a one-minute cache keeps each question well under the spec's 150 ms.
// Only live rows are loaded: nothing else can reach a student.

const LIVE = "live" as const;
const CACHE_MS = 60_000;

export type WordCore = {
  senseId: number;
  headword: string;
  display: string;
  gloss: string;
  definition: string;
  lemmaAudioKey: string | null;
  example: {
    text: string;
    start: number;
    end: number;
    translation: string;
    audioKey: string | null;
  } | null;
};

export type TrainingContent = {
  senses: EngineSense[];
  byId: Map<number, EngineSense>;
  core: Map<number, WordCore>;
  /** Normalized headwords and surface forms in the bank, for the answer checker. */
  forms: Set<string>;
  /** Live senses in teaching order (frequency rank). */
  order: number[];
};

const cache = globalThis as unknown as { trainingContent?: { at: number; value: TrainingContent } };

export async function getTrainingContent(): Promise<TrainingContent> {
  const hit = cache.trainingContent;
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await loadTrainingContent();
  cache.trainingContent = { at: Date.now(), value };
  return value;
}

/** Drops the cache, for tests that change content. */
export function clearTrainingContentCache() {
  delete cache.trainingContent;
}

async function loadTrainingContent(): Promise<TrainingContent> {
  const db = getDb();
  const rows = await db
    .select({ sense, lemma })
    .from(sense)
    .innerJoin(lemma, eq(sense.lemmaId, lemma.id))
    .where(and(eq(sense.status, LIVE), eq(lemma.status, LIVE)))
    .orderBy(asc(sense.frequencyRank), asc(sense.id));
  if (rows.length === 0)
    return { senses: [], byId: new Map(), core: new Map(), forms: new Set(), order: [] };

  const senseIds = rows.map((r) => r.sense.id);
  const lemmaIds = [...new Set(rows.map((r) => r.lemma.id))];
  const target = alias(sense, "target");

  const [examples, relations, parts, audios] = await Promise.all([
    db
      .select()
      .from(example)
      .where(and(inArray(example.senseId, senseIds), eq(example.status, LIVE)))
      .orderBy(asc(example.senseId), asc(example.position)),
    db
      .select({ senseId: relation.senseId, type: relation.type, targetId: target.id })
      .from(relation)
      .innerJoin(target, and(eq(target.key, relation.targetKey), eq(target.status, LIVE)))
      .where(and(inArray(relation.senseId, senseIds), eq(relation.status, LIVE))),
    db
      .select({ lemmaId: wordPart.lemmaId })
      .from(wordPart)
      .where(and(inArray(wordPart.lemmaId, lemmaIds), eq(wordPart.status, LIVE))),
    db
      .select({ lemmaId: audio.lemmaId, exampleId: audio.exampleId, fileKey: audio.fileKey })
      .from(audio)
      .where(eq(audio.status, LIVE)),
  ]);

  const examplesBySense = new Map<number, (typeof examples)[number][]>();
  for (const e of examples)
    examplesBySense.set(e.senseId, [...(examplesBySense.get(e.senseId) ?? []), e]);
  const lemmasWithParts = new Set(parts.map((p) => p.lemmaId));
  const lemmaAudio = new Map(audios.filter((a) => a.lemmaId).map((a) => [a.lemmaId!, a.fileKey]));
  const exampleAudio = new Map(
    audios.filter((a) => a.exampleId).map((a) => [a.exampleId!, a.fileKey]),
  );
  const live = new Set(senseIds);
  const related = (id: number, type: string) =>
    relations
      .filter((r) => r.senseId === id && r.type === type && live.has(r.targetId))
      .map((r) => r.targetId);

  const senses: EngineSense[] = [];
  const core = new Map<number, WordCore>();
  const forms = new Set<string>();
  for (const { sense: s, lemma: l } of rows) {
    const exs = examplesBySense.get(s.id) ?? [];
    const article = articleFor(l);
    senses.push({
      id: s.id,
      lemmaId: l.id,
      headword: l.headword,
      partOfSpeech: l.partOfSpeech,
      article: article as EngineSense["article"],
      gloss: s.gloss,
      frequencyRank: s.frequencyRank,
      level: s.level,
      difficulty: s.difficulty,
      cognate: s.cognate,
      hasWordParts: lemmasWithParts.has(l.id),
      synonymIds: related(s.id, "synonym"),
      antonymIds: related(s.id, "antonym"),
      familyIds: related(s.id, "family"),
      confusedIds: related(s.id, "confused_with"),
      examples: exs.map((e) => ({
        id: e.id,
        text: e.text,
        surfaceForm: e.surfaceForm,
        start: e.startOffset,
        end: e.endOffset,
        distractors: e.distractors,
      })),
      // Reviewed misuse sentences arrive with the Phase 9 pipeline (DECISIONS.md).
      misuses: [],
    });
    const first = exs[0];
    core.set(s.id, {
      senseId: s.id,
      headword: l.headword,
      display: article ? `${article} ${l.headword}` : l.headword,
      gloss: s.gloss,
      definition: s.definition,
      lemmaAudioKey: lemmaAudio.get(l.id) ?? null,
      example: first
        ? {
            text: first.text,
            start: first.startOffset,
            end: first.endOffset,
            translation: first.translation,
            audioKey: exampleAudio.get(first.id) ?? null,
          }
        : null,
    });
    forms.add(normalizeAnswer(l.headword));
    for (const e of exs) forms.add(normalizeAnswer(e.surfaceForm));
  }

  return {
    senses,
    byId: new Map(senses.map((s) => [s.id, s])),
    core,
    forms,
    order: senses.map((s) => s.id),
  };
}
