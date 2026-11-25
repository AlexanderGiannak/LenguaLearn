import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/lib/db/client";
import { audio, example, lemma, sense } from "@/lib/db/schema";
import { spokenHeadword } from "./display";
import { saveAudio } from "./import";

// Content pipeline step 6 on the app's side. The audio script on the owner's laptop asks
// what needs a recording (the app's own current text, so a reviewer's edits are spoken),
// makes it, uploads it to the media bucket and attaches it here. New recordings arrive as
// draft and reach students only through review, like any other content.

type Db = ReturnType<typeof getDb>;

export type AudioOwner = "lemma" | "example";

/**
 * One headword or sentence that needs a recording. `remake` means a reviewer flagged the
 * last recording of this same text, so the script must make a fresh one.
 */
export type AudioNeed = {
  owner: AudioOwner;
  id: number;
  key: string;
  text: string;
  remake: boolean;
};

type Existing = { spoken: string | null; audioStatus: string | null };
// Each owner has at most one audio row (unique), retired or not.
const needed = (r: Existing, text: string) =>
  r.audioStatus === null || r.audioStatus === "retired" || r.spoken !== text;
const remake = (r: Existing, text: string) => r.audioStatus === "retired" && r.spoken === text;

/**
 * Headwords and sentences of every non-retired sense with no recording of their current
 * text (none yet, retired after a reviewer flagged it, or made for an older text). With
 * `lemmaKey`, only that word; with `all` as well, every recording of it, to make again.
 */
export async function audioNeeds(
  db: Db,
  opts: { lemmaKey?: string; all?: boolean } = {},
): Promise<AudioNeed[]> {
  const all = opts.all === true && opts.lemmaKey !== undefined;
  const lemmas = await db
    .selectDistinct({
      id: lemma.id,
      key: lemma.key,
      rank: lemma.frequencyRank,
      headword: lemma.headword,
      partOfSpeech: lemma.partOfSpeech,
      gender: lemma.gender,
      articleOverride: lemma.articleOverride,
      spoken: audio.spokenText,
      audioStatus: audio.status,
    })
    .from(lemma)
    .innerJoin(sense, and(eq(sense.lemmaId, lemma.id), ne(sense.status, "retired")))
    .leftJoin(audio, eq(audio.lemmaId, lemma.id))
    .where(
      and(ne(lemma.status, "retired"), opts.lemmaKey ? eq(lemma.key, opts.lemmaKey) : undefined),
    )
    .orderBy(lemma.frequencyRank, lemma.key);

  const examples = await db
    .select({
      id: example.id,
      key: sense.key,
      position: example.position,
      text: example.text,
      spoken: audio.spokenText,
      audioStatus: audio.status,
    })
    .from(example)
    .innerJoin(sense, and(eq(sense.id, example.senseId), ne(sense.status, "retired")))
    .innerJoin(lemma, eq(lemma.id, sense.lemmaId))
    .leftJoin(audio, eq(audio.exampleId, example.id))
    .where(
      and(
        ne(example.status, "retired"),
        ne(lemma.status, "retired"),
        opts.lemmaKey ? eq(lemma.key, opts.lemmaKey) : undefined,
        all
          ? undefined
          : or(
              sql`${audio.id} is null`,
              eq(audio.status, "retired"),
              ne(audio.spokenText, example.text),
            ),
      ),
    )
    .orderBy(sense.frequencyRank, sense.key, example.position);

  return [
    ...lemmas.flatMap((l) => {
      const text = spokenHeadword(l);
      return all || needed(l, text)
        ? [{ owner: "lemma" as const, id: l.id, key: l.key, text, remake: remake(l, text) }]
        : [];
    }),
    ...examples.map((e) => ({
      owner: "example" as const,
      id: e.id,
      key: `${e.key}#ex${e.position + 1}`,
      text: e.text,
      remake: remake(e, e.text),
    })),
  ];
}

// The same media path rule as the import schema: segments start with a letter or digit.
const fileKey = z
  .string()
  .max(200)
  .regex(/^audio\/[a-z0-9][a-z0-9_.-]*\.mp3$/, "must be audio/<name>.mp3");

export const attachAudioSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        owner: z.enum(["lemma", "example"]),
        id: z.int().min(1).max(2_147_483_647),
        // The text the recording says, as the script was given it.
        text: z.string().min(1).max(300),
        fileKey,
        voiceId: z.string().min(1).max(50),
        generatedAt: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(200),
});
export type AttachAudioInput = z.infer<typeof attachAudioSchema>;

export type AttachResult = {
  attached: number;
  unchanged: number;
  /** The text changed (or the row was retired) after the script asked: made again next run. */
  stale: { owner: AudioOwner; id: number }[];
};

/** Attaches finished recordings, skipping any whose headword or sentence changed meanwhile. */
export async function attachAudio(db: Db, input: AttachAudioInput): Promise<AttachResult> {
  return db.transaction(async (tx) => {
    const lemmaIds = input.items.filter((i) => i.owner === "lemma").map((i) => i.id);
    const exampleIds = input.items.filter((i) => i.owner === "example").map((i) => i.id);
    const lemmas = lemmaIds.length
      ? await tx
          .select({
            id: lemma.id,
            headword: lemma.headword,
            partOfSpeech: lemma.partOfSpeech,
            gender: lemma.gender,
            articleOverride: lemma.articleOverride,
          })
          .from(lemma)
          .where(and(inArray(lemma.id, lemmaIds), ne(lemma.status, "retired")))
      : [];
    const examples = exampleIds.length
      ? await tx
          .select({ id: example.id, text: example.text })
          .from(example)
          .where(and(inArray(example.id, exampleIds), ne(example.status, "retired")))
      : [];
    const current = new Map<string, string>([
      ...lemmas.map((l) => [`lemma:${l.id}`, spokenHeadword(l)] as const),
      ...examples.map((e) => [`example:${e.id}`, e.text] as const),
    ]);

    const result: AttachResult = { attached: 0, unchanged: 0, stale: [] };
    for (const item of input.items) {
      if (current.get(`${item.owner}:${item.id}`) !== item.text) {
        result.stale.push({ owner: item.owner, id: item.id });
        continue;
      }
      const rows = await saveAudio(
        tx,
        item.owner === "lemma" ? { lemmaId: item.id } : { exampleId: item.id },
        {
          fileKey: item.fileKey,
          voiceId: item.voiceId,
          generatedAt: new Date(item.generatedAt),
          spokenText: item.text,
        },
      );
      if (rows.some((r) => r.action === "unchanged")) result.unchanged += 1;
      else result.attached += 1;
    }
    return result;
  });
}
