import { articleFor } from "@/lib/content/display";
import type { WordPageData } from "@/lib/content/word-page";
import { buildQuestion, type Question, type QuestionType } from "@/lib/engine/questions";
import { seededRng, type EngineSense } from "@/lib/engine/types";

// The questions a student could get for a sense, built by the engine's own buildQuestion,
// so the review tool shows each sense "as a student would see its questions" (spec step 4).
// Wrong options for meaning questions come from the live senses, as in training.

export type PreviewQuestion = { label: string; question: Question };

/** The engine's view of a sense under review (the same mapping training uses for live ones). */
export function toEngineSense(page: WordPageData, misuses: readonly string[]): EngineSense {
  const related = (type: string) =>
    page.relations.filter((r) => r.type === type && r.targetId !== null).map((r) => r.targetId!);
  return {
    id: page.sense.id,
    lemmaId: page.lemma.id,
    headword: page.lemma.headword,
    partOfSpeech: page.lemma.partOfSpeech,
    article: articleFor(page.lemma) as EngineSense["article"],
    gloss: page.sense.gloss,
    frequencyRank: page.sense.frequencyRank,
    level: page.sense.level,
    difficulty: page.sense.difficulty,
    cognate: page.sense.cognate,
    hasWordParts: page.wordParts.length > 0,
    synonymIds: related("synonym"),
    antonymIds: related("antonym"),
    familyIds: related("family"),
    confusedIds: related("confused_with"),
    examples: page.examples.map((e) => ({
      id: e.id,
      text: e.text,
      surfaceForm: e.surfaceForm,
      start: e.startOffset,
      end: e.endOffset,
      distractors: e.distractors,
    })),
    misuses,
  };
}

/**
 * One question of each kind that fits the sense, and a fill-in-the-gap question for every
 * sentence, since each sentence has its own wrong choices to check. Seeded by the sense, so
 * the page shows the same options on every visit.
 */
export function previewQuestions(
  sense: EngineSense,
  livePool: readonly EngineSense[],
): PreviewQuestion[] {
  const pool = livePool.filter((s) => s.id !== sense.id);
  const rng = seededRng(sense.id);
  const make = (type: QuestionType, s: EngineSense = sense) =>
    buildQuestion({ type, sense: s, pool: [s, ...pool], rng });
  const out: PreviewQuestion[] = [
    { label: "Meaning, multiple choice", question: make("meaning_choice") },
    { label: "Spanish word, multiple choice", question: make("word_choice") },
  ];
  if (sense.article === "el" || sense.article === "la")
    out.push({ label: "Article", question: make("gender_choice") });
  sense.examples.forEach((ex, i) => {
    out.push({
      label: `Sentence ${i + 1}, fill the gap`,
      question: make("cloze_choice", { ...sense, examples: [ex] }),
    });
  });
  if (sense.examples.length > 0 && sense.misuses.length >= 2)
    out.push({ label: "Correct use", question: make("usage_choice") });
  const relatedIds = [...sense.synonymIds, ...sense.antonymIds];
  if (pool.some((s) => relatedIds.includes(s.id)))
    out.push({ label: "Related word", question: make("relation_choice") });
  if (sense.examples.length > 0) out.push({ label: "Typed answer", question: make("cloze_typed") });
  return out;
}
