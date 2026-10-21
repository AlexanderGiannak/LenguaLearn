import type { Gender, PartOfSpeech, Register } from "./constants";

type LemmaGrammar = {
  partOfSpeech: PartOfSpeech;
  gender: Gender | null;
  articleOverride?: "el" | "la" | null;
};

/** Nouns always display with their article: gender is part of knowing the word. */
export function articleFor(lemma: LemmaGrammar): string | null {
  if (lemma.partOfSpeech !== "noun") return null;
  if (lemma.articleOverride) return lemma.articleOverride;
  if (lemma.gender === "m") return "el";
  if (lemma.gender === "f") return "la";
  return "el/la";
}

const GENDER_WORD: Record<Gender, string> = {
  m: "masculine",
  f: "feminine",
  both: "masculine or feminine",
};

export function partOfSpeechLabel(lemma: Omit<LemmaGrammar, "articleOverride">): string {
  if (lemma.partOfSpeech === "noun" && lemma.gender) return `${GENDER_WORD[lemma.gender]} noun`;
  return lemma.partOfSpeech;
}

export function registerLabel(register: Register, region: string | null): string | null {
  if (register === "neutral") return null;
  if (register === "regional") return `Regional: ${region}`;
  return register === "formal" ? "Formal" : "Informal";
}

export function splitAtOffsets(text: string, start: number, end: number) {
  return { before: text.slice(0, start), target: text.slice(start, end), after: text.slice(end) };
}

/** Public URL of a media file. Phase 10 points MEDIA_BASE_URL at the CloudFront audio domain. */
export function mediaUrl(fileKey: string): string {
  return `${process.env.MEDIA_BASE_URL ?? ""}/${fileKey}`;
}
