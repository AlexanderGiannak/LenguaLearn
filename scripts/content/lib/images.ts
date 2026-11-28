// Content pipeline step 7: the pure parts of finding or making a picture for a concrete
// sense (spec: Content pipeline, step 7). An openly licensed library first (Openverse),
// AI generation (OpenAI) only when nothing there fits (owner, 2026-11-24). Allowed
// licenses: CC0, public domain, CC BY and CC BY-SA (owner, 2026-11-27).
import { createHash } from "node:crypto";
import { z } from "zod";

/** Openverse's license codes for the licenses the owner allowed. */
export const OPENVERSE_LICENSES = ["cc0", "pdm", "by", "by-sa"] as const;
/** Library pictures shown to the picker per sense. */
export const CANDIDATES_PER_SENSE = 6;
/** The picker: the same OpenAI model as the step 3 check, at low effort. */
export const PICK_MODEL = "gpt-6.2-sol";
export const PICK_EFFORT = "low";
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_QUALITY = "medium";
/** How a generated picture is credited. Generated content is CC BY 4.0, like the rest. */
export const GENERATED = {
  source: `openai/${IMAGE_MODEL}`,
  license: "CC BY 4.0",
  attribution: "AI-generated picture",
} as const;
/** Longest side of a stored picture; the word page shows it at most 160 pixels wide. */
export const MAX_SIDE = 800;

// Prices (OpenAI, 2026-11). A pick sends six small low-detail pictures and some text and
// gets a short answer with reasoning: about a cent. gpt-image-2 at medium quality and
// 1024x1024 is about $0.053 a picture; text input $5 and image output $30 per million.
export const USD_PER_PICK = 0.01;
export const USD_PER_GENERATED = 0.06;
const IMAGE_USD_PER_MILLION = { textInput: 5, imageOutput: 30 };

/** The fields of an Openverse image search result that this module reads. */
export type OpenverseImage = {
  id: string;
  title?: string | null;
  url?: string | null;
  foreign_landing_url?: string | null;
  creator?: string | null;
  license: string;
  license_version?: string | null;
  provider?: string | null;
  source?: string | null;
  width?: number | null;
  height?: number | null;
  mature?: boolean | null;
};

/** A library picture that may be used: where to fetch it and how to credit it. */
export type Candidate = {
  url: string;
  /** The page the picture comes from; also how a rejected picture is recognized. */
  source: string;
  license: string;
  attribution: string;
};

/** A stored license name ("CC BY-SA 4.0") for an Openverse license, or null if not allowed. */
export function licenseName(license: string, version?: string | null): string | null {
  const v = version && /^[1-4]\.0$/.test(version) ? version : null;
  switch (license.toLowerCase()) {
    case "cc0":
      return "CC0 1.0";
    case "pdm":
      return "Public domain mark 1.0";
    case "by":
      return v ? `CC BY ${v}` : null;
    case "by-sa":
      return v ? `CC BY-SA ${v}` : null;
    default:
      return null;
  }
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Title, author and where it is from, as the licenses ask, in at most 200 characters. */
export function attributionFor(r: OpenverseImage): string {
  const title = clean(r.title);
  const creator = clean(r.creator);
  const where = clean(r.provider ?? r.source);
  const by = creator ? ` by ${clip(creator, 60)}` : "";
  const via = where ? ` via ${clip(where, 30)}` : "";
  const named = title ? `“${clip(title, 200 - by.length - via.length - 2)}”` : "Photo";
  return `${named}${by}${via}`;
}

/** A search result as a candidate, or null if it may not or should not be used. */
export function toCandidate(r: OpenverseImage, rejected: ReadonlySet<string>): Candidate | null {
  const license = licenseName(r.license, r.license_version);
  const url = r.url ?? "";
  const source = r.foreign_landing_url ?? "";
  if (!license || r.mature) return null;
  if (!/^https:\/\//.test(url) || !/^https:\/\//.test(source) || source.length > 200) return null;
  if (rejected.has(source)) return null;
  // Too small to show clearly, or a strip or banner rather than a picture of a thing.
  const w = r.width ?? 0;
  const h = r.height ?? 0;
  if ((w && w < 320) || (h && h < 240) || (w && h && Math.max(w / h, h / w) > 2.5)) return null;
  return { url, source, license, attribution: attributionFor(r) };
}

/** The search words for a sense: its English gloss without articles or notes. */
export function searchQuery(gloss: string): string {
  return gloss
    .replace(/\([^)]*\)/g, " ")
    .split(/[;,/]/)[0]!
    .replace(/^\s*(?:to|a|an|the)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type PickNeed = { headword: string; gloss: string; imageDescription: string };

/** The picker's answer: which picture (1-based), or 0 for none, and alt text for it. */
export const pickSchema = z.object({
  choice: z.number().int(),
  reason: z.string(),
  alt: z.string(),
});
export type Pick = z.infer<typeof pickSchema>;

export const PICK_INSTRUCTIONS = `You choose pictures for a free Spanish vocabulary app used by high school students and adults. A picture appears next to a word's English meaning, so a learner should see the meaning at a glance.

A picture is suitable only if all of these hold:
- It clearly shows the described meaning, and not a different or more general thing.
- It has no visible text, letters, numbers, logos, watermarks or captions.
- It is suitable for a school: nothing violent, sexual, frightening or offensive.
- No identifiable person is the main subject in close-up, and no brand is prominent.
- It is clear at a small size: one main subject, not cluttered, not too dark.

Pictures are numbered from 1 in the order given. Answer with the number of the best suitable picture, or 0 if none is suitable. Give a one-sentence reason. For a chosen picture, write alt text: one short English sentence describing what the picture shows, for someone who cannot see it, without "picture of" or "image of". If none is chosen, alt is empty.`;

export function pickPrompt(need: PickNeed, count: number, rejectedReason?: string | null): string {
  return [
    `Spanish word: ${need.headword}`,
    `Meaning: ${need.gloss}`,
    `What the picture should show: ${need.imageDescription}`,
    ...(rejectedReason ? [`A reviewer rejected an earlier picture: ${rejectedReason}`] : []),
    `There ${count === 1 ? "is 1 picture" : `are ${count} pictures`}.`,
  ].join("\n");
}

/** Whether a pick chose one of `count` pictures, and which (0-based), or null. */
export function chosenIndex(pick: Pick, count: number): number | null {
  return pick.choice >= 1 && pick.choice <= count && pick.alt.trim() ? pick.choice - 1 : null;
}

/** What gpt-image-2 is asked for when the library has nothing suitable. */
export function generationPrompt(need: PickNeed, rejectedReason?: string | null): string {
  return [
    need.imageDescription,
    "",
    `This picture illustrates the meaning "${need.gloss}" in a vocabulary app, shown small next to the word.`,
    "Style: a clear, realistic photograph with one main subject, plain uncluttered background, natural light.",
    "No text, letters, numbers, signs, labels, logos or watermarks anywhere in the picture.",
    "No real or famous people and no brands. Suitable for a school.",
    ...(rejectedReason
      ? [`Avoid what a reviewer disliked in an earlier picture: ${rejectedReason}`]
      : []),
  ].join("\n");
}

/** What a gpt-image-2 request cost, from its usage, or the estimate if it reported none. */
export function generatedUsd(usage?: { input_tokens?: number; output_tokens?: number } | null) {
  if (!usage?.output_tokens) return USD_PER_GENERATED;
  return (
    ((usage.input_tokens ?? 0) * IMAGE_USD_PER_MILLION.textInput +
      usage.output_tokens * IMAGE_USD_PER_MILLION.imageOutput) /
    1_000_000
  );
}

/**
 * The cost of a run: typically one pick per sense and a generated picture (with its check)
 * for about half; at most two generations and three picks per sense.
 */
export function estimateImagesUsd(senses: number): { typical: number; most: number } {
  return {
    typical: senses * (USD_PER_PICK + 0.5 * (USD_PER_GENERATED + USD_PER_PICK)),
    most: senses * (3 * USD_PER_PICK + 2 * USD_PER_GENERATED),
  };
}

/** The media path of a finished picture: a hash of its bytes, so each path never changes. */
export function imageFileKey(bytes: Uint8Array): string {
  return `images/${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.jpg`;
}
