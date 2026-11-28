import { z } from "zod";
import {
  COGNATE_STATUSES,
  CONCRETENESS,
  HOOK_KINDS,
  REGISTERS,
  RELATION_TYPES,
} from "@/lib/content/constants";

// What the review tool's editor sends. Text is trimmed and NFC-normalized here; the full
// content rules (word counts, distinct distractors, the target word's place in the
// sentence) are the import schema's, applied when the edit is saved (service.ts).

const str = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.normalize("NFC").trim());
const optionalStr = (max: number) =>
  str(max)
    .optional()
    .transform((s) => (s ? s : undefined));

export const senseEditSchema = z.strictObject({
  /** The sense's updatedAt when the editor loaded it: a save over someone else's is refused. */
  loadedAt: z.iso.datetime({ offset: true }),
  gloss: str(60),
  definition: str(300),
  register: z.enum(REGISTERS),
  region: optionalStr(60),
  cognate: z.enum(COGNATE_STATUSES),
  cognateEnglish: optionalStr(60),
  concreteness: z.enum(CONCRETENESS),
  imageDescription: optionalStr(300),
  themes: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(10),
  examples: z
    .array(
      z.strictObject({
        text: str(300),
        surfaceForm: str(60),
        translation: str(300),
        distractors: z.array(str(60)).length(3),
      }),
    )
    .max(8),
  hooks: z.array(z.strictObject({ kind: z.enum(HOOK_KINDS), text: str(300) })).max(3),
  relations: z
    .array(
      z.strictObject({
        type: z.enum(RELATION_TYPES),
        text: str(80),
        targetKey: optionalStr(120),
      }),
    )
    .max(30),
  misuses: z.array(z.strictObject({ text: str(300), explanation: str(300) })).max(6),
});
export type SenseEdit = z.output<typeof senseEditSchema>;

export const decisionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("approve") }),
  z.strictObject({ action: z.literal("reject"), reason: str(500).pipe(z.string().min(3)) }),
]);

export const pseudowordDecisionSchema = z.strictObject({
  ids: z.array(z.int().positive()).min(1).max(500),
  action: z.enum(["approve", "reject"]),
});

/** A wrong pronunciation in the headword's or a sentence's recording. */
export const flagAudioSchema = z.strictObject({
  target: z.discriminatedUnion("owner", [
    z.strictObject({ owner: z.literal("lemma") }),
    z.strictObject({
      owner: z.literal("example"),
      exampleId: z.int().min(1).max(2_147_483_647),
    }),
  ]),
  reason: str(300).pipe(z.string().min(3)),
});

export const rejectImageSchema = z.strictObject({
  reason: str(300).pipe(z.string().min(3)),
});
