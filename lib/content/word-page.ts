import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { audio, example, hook, image, lemma, relation, sense, wordPart } from "@/lib/db/schema";

// The one query behind /word/[id]. Every table is filtered to live rows: a sense that is
// not live (or whose lemma is not live) is not found, and non-live examples, hooks,
// images and relations are left out.

const LIVE = "live" as const;
const targetSense = alias(sense, "target_sense");
const targetLemma = alias(lemma, "target_lemma");

export async function getLiveWordPage(senseId: number) {
  const db = getDb();
  const [row] = await db
    .select({ sense, lemma })
    .from(sense)
    .innerJoin(lemma, eq(sense.lemmaId, lemma.id))
    .where(and(eq(sense.id, senseId), eq(sense.status, LIVE), eq(lemma.status, LIVE)));
  if (!row) return null;

  const [examples, hooks, images, relations, wordParts, lemmaAudio] = await Promise.all([
    db
      .select()
      .from(example)
      .where(and(eq(example.senseId, senseId), eq(example.status, LIVE)))
      .orderBy(asc(example.position)),
    db
      .select()
      .from(hook)
      .where(and(eq(hook.senseId, senseId), eq(hook.status, LIVE)))
      .orderBy(asc(hook.position)),
    db
      .select()
      .from(image)
      .where(and(eq(image.senseId, senseId), eq(image.status, LIVE)))
      .orderBy(asc(image.position)),
    db
      .select({
        type: relation.type,
        text: relation.text,
        // Links only to a related sense that is itself live.
        targetId: targetLemma.id,
        targetSenseId: targetSense.id,
      })
      .from(relation)
      .leftJoin(
        targetSense,
        and(eq(targetSense.key, relation.targetKey), eq(targetSense.status, LIVE)),
      )
      .leftJoin(
        targetLemma,
        and(eq(targetLemma.id, targetSense.lemmaId), eq(targetLemma.status, LIVE)),
      )
      .where(and(eq(relation.senseId, senseId), eq(relation.status, LIVE)))
      .orderBy(asc(relation.position)),
    db
      .select()
      .from(wordPart)
      .where(and(eq(wordPart.lemmaId, row.lemma.id), eq(wordPart.status, LIVE)))
      .orderBy(asc(wordPart.position)),
    db
      .select({ fileKey: audio.fileKey })
      .from(audio)
      .where(and(eq(audio.lemmaId, row.lemma.id), eq(audio.status, LIVE))),
  ]);

  const exampleAudio = examples.length
    ? await db
        .select({ exampleId: audio.exampleId, fileKey: audio.fileKey })
        .from(audio)
        .where(
          and(
            inArray(
              audio.exampleId,
              examples.map((e) => e.id),
            ),
            eq(audio.status, LIVE),
          ),
        )
    : [];
  const audioByExample = new Map(exampleAudio.map((a) => [a.exampleId, a.fileKey]));

  return {
    lemma: row.lemma,
    sense: row.sense,
    lemmaAudioKey: lemmaAudio[0]?.fileKey ?? null,
    examples: examples.map((e) => ({ ...e, audioKey: audioByExample.get(e.id) ?? null })),
    hook: hooks[0] ?? null,
    image: images[0] ?? null,
    relations: relations.map((r) => ({
      type: r.type,
      text: r.text,
      targetId: r.targetId !== null ? r.targetSenseId : null,
    })),
    wordParts,
  };
}

export type WordPageData = NonNullable<Awaited<ReturnType<typeof getLiveWordPage>>>;
