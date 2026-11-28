import { and, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/lib/db/client";
import { contentRevision, image, lemma, reviewLog, sense } from "@/lib/db/schema";
import { saveImage } from "./import";

// Content pipeline step 7 on the app's side. The image script on the owner's laptop asks
// which concrete senses need a picture, finds one in an openly licensed library or has one
// made, uploads it to the media bucket and attaches it here. New pictures arrive as draft
// and reach students only through review, like any other content.

type Db = ReturnType<typeof getDb>;

/** A concrete sense with no picture, or whose picture a reviewer rejected. */
export type ImageNeed = {
  senseId: number;
  key: string;
  headword: string;
  gloss: string;
  imageDescription: string;
  /** Sources of pictures reviewers rejected for this sense: never offer them again. */
  rejected: string[];
  /** What the reviewer said about the last rejected picture, if anything. */
  rejectedReason: string | null;
};

/**
 * Concrete senses (not retired, with an image description) whose picture slot is empty or
 * holds a rejected picture. With `lemmaKey`, only that word.
 */
export async function imageNeeds(db: Db, opts: { lemmaKey?: string } = {}): Promise<ImageNeed[]> {
  const rows = await db
    .select({
      senseId: sense.id,
      key: sense.key,
      headword: lemma.headword,
      gloss: sense.gloss,
      imageDescription: sense.imageDescription,
      imageId: image.id,
      imageSource: image.source,
    })
    .from(sense)
    .innerJoin(lemma, eq(lemma.id, sense.lemmaId))
    .leftJoin(image, and(eq(image.senseId, sense.id), eq(image.position, 0)))
    .where(
      and(
        ne(sense.status, "retired"),
        ne(lemma.status, "retired"),
        eq(sense.concreteness, "concrete"),
        isNotNull(sense.imageDescription),
        or(sql`${image.id} is null`, eq(image.status, "retired")),
        opts.lemmaKey ? eq(lemma.key, opts.lemmaKey) : undefined,
      ),
    )
    .orderBy(sense.frequencyRank, sense.key);
  if (rows.length === 0) return [];

  // Earlier pictures in the same slot are in the content revisions.
  const imageIds = rows.flatMap((r) => (r.imageId ? [r.imageId] : []));
  const revisions = imageIds.length
    ? await db
        .select({ rowId: contentRevision.rowId, snapshot: contentRevision.snapshot })
        .from(contentRevision)
        .where(
          and(eq(contentRevision.tableName, "image"), inArray(contentRevision.rowId, imageIds)),
        )
    : [];
  const reasons = imageIds.length
    ? await db
        .select({ senseId: reviewLog.senseId, reason: reviewLog.reason })
        .from(reviewLog)
        .where(
          and(
            eq(reviewLog.action, "reject_image"),
            inArray(
              reviewLog.senseId,
              rows.filter((r) => r.imageId).map((r) => r.senseId),
            ),
          ),
        )
        .orderBy(desc(reviewLog.id))
    : [];

  return rows.map((r) => {
    const rejected = new Set<string>();
    if (r.imageSource) rejected.add(r.imageSource);
    for (const rev of revisions) {
      const source = (rev.snapshot as { source?: unknown }).source;
      if (rev.rowId === r.imageId && typeof source === "string") rejected.add(source);
    }
    return {
      senseId: r.senseId,
      key: r.key,
      headword: r.headword,
      gloss: r.gloss,
      imageDescription: r.imageDescription!,
      rejected: [...rejected].sort(),
      rejectedReason: r.imageId
        ? (reasons.find((x) => x.senseId === r.senseId)?.reason ?? null)
        : null,
    };
  });
}

const text = (max: number) => z.string().trim().min(1).max(max);

export const attachImagesSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        senseId: z.int().min(1).max(2_147_483_647),
        // The description the picture was chosen for, as the script was given it.
        imageDescription: text(300),
        fileKey: z
          .string()
          .max(200)
          .regex(/^images\/[a-z0-9]+\.jpg$/, "must be images/<name>.jpg"),
        alt: text(200),
        source: text(200),
        license: text(100),
        attribution: text(200),
      }),
    )
    .min(1)
    .max(100),
});
export type AttachImagesInput = z.infer<typeof attachImagesSchema>;

export type AttachImagesResult = {
  attached: number;
  unchanged: number;
  /**
   * The sense changed after the script asked (its description, or it is no longer a
   * concrete sense), or it has a picture again: skipped, and asked for again if needed.
   */
  stale: number[];
};

/** Attaches finished pictures, skipping any whose sense changed meanwhile. */
export async function attachImages(db: Db, input: AttachImagesInput): Promise<AttachImagesResult> {
  return db.transaction(async (tx) => {
    const ids = input.items.map((i) => i.senseId);
    const senses = await tx
      .select({
        id: sense.id,
        imageDescription: sense.imageDescription,
        imageStatus: image.status,
        imageFileKey: image.fileKey,
      })
      .from(sense)
      .innerJoin(lemma, eq(lemma.id, sense.lemmaId))
      .leftJoin(image, and(eq(image.senseId, sense.id), eq(image.position, 0)))
      .where(
        and(
          inArray(sense.id, ids),
          ne(sense.status, "retired"),
          ne(lemma.status, "retired"),
          eq(sense.concreteness, "concrete"),
        ),
      )
      .for("update", { of: sense });
    const current = new Map(senses.map((s) => [s.id, s]));

    const result: AttachImagesResult = { attached: 0, unchanged: 0, stale: [] };
    for (const { senseId, imageDescription, ...values } of input.items) {
      const s = current.get(senseId);
      const taken =
        s?.imageStatus != null && s.imageStatus !== "retired" && s.imageFileKey !== values.fileKey;
      if (!s || s.imageDescription !== imageDescription || taken) {
        result.stale.push(senseId);
        continue;
      }
      const rows = await saveImage(tx, senseId, values);
      if (rows.some((r) => r.action === "unchanged")) result.unchanged += 1;
      else result.attached += 1;
    }
    return result;
  });
}
