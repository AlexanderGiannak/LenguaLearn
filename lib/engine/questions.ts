import type { CardKind } from "./cards.ts";
import { ENGINE_CONFIG } from "./config.ts";
import { pickDistractors } from "./distractors.ts";
import type { AnswerMode } from "./rating.ts";
import type { EngineExample, EngineSense, Rng } from "./types.ts";
import { shuffle } from "./types.ts";

// Question types by band (spec: Question types). Each type tests one card; its band comes
// from that card's stability. "Listening" questions test recognition: the student hears
// the word itself, so even when typing it they are not producing it from its meaning.

export type Band = "low" | "mid" | "high";

type TypeInfo = {
  card: CardKind;
  bands: readonly Band[];
  mode: AnswerMode;
  needsAudio: boolean;
};

export const QUESTION_TYPES = {
  meaning_choice: { card: "recognition", bands: ["low"], mode: "choice", needsAudio: false },
  listen_meaning_choice: { card: "recognition", bands: ["low"], mode: "choice", needsAudio: true },
  cloze_choice: { card: "recognition", bands: ["mid"], mode: "choice", needsAudio: false },
  relation_choice: { card: "recognition", bands: ["mid"], mode: "choice", needsAudio: false },
  usage_choice: { card: "recognition", bands: ["high"], mode: "choice", needsAudio: false },
  listen_cloze_typed: { card: "recognition", bands: ["high"], mode: "typed", needsAudio: true },
  word_choice: { card: "production", bands: ["low", "mid"], mode: "choice", needsAudio: false },
  gender_choice: { card: "production", bands: ["mid"], mode: "choice", needsAudio: false },
  meaning_typed: { card: "production", bands: ["high"], mode: "typed", needsAudio: false },
  cloze_typed: { card: "production", bands: ["high"], mode: "typed", needsAudio: false },
  // Chosen separately, now and then, for "commonly confused" pairs.
  contrast_choice: { card: "production", bands: [], mode: "choice", needsAudio: false },
} as const satisfies Record<string, TypeInfo>;

export type QuestionType = keyof typeof QUESTION_TYPES;

export function bandFor(stabilityDays: number): Band {
  const { lowDays, highDays } = ENGINE_CONFIG.bands;
  if (stabilityDays < lowDays) return "low";
  return stabilityDays <= highDays ? "mid" : "high";
}

const FALLBACK_ORDER: Record<Band, readonly Band[]> = {
  low: ["low", "mid", "high"],
  mid: ["mid", "low", "high"],
  high: ["high", "mid", "low"],
};

function relatedInPool(sense: EngineSense, pool: readonly EngineSense[] | undefined) {
  const ids = [...sense.synonymIds, ...sense.antonymIds];
  return pool ? pool.filter((s) => ids.includes(s.id)) : ids;
}

function fits(
  type: QuestionType,
  sense: EngineSense,
  ctx: { audio: boolean; pool?: readonly EngineSense[] },
): boolean {
  if (QUESTION_TYPES[type].needsAudio && !ctx.audio) return false;
  switch (type) {
    case "cloze_choice":
    case "cloze_typed":
    case "listen_cloze_typed":
      return sense.examples.length > 0;
    case "usage_choice":
      return sense.examples.length > 0 && sense.misuses.length >= 2;
    case "relation_choice":
      return relatedInPool(sense, ctx.pool).length > 0;
    case "gender_choice":
      return sense.article === "el" || sense.article === "la";
    case "contrast_choice":
      return false;
    default:
      return true;
  }
}

/**
 * Picks the question type for one card. Within a band the type varies and never repeats
 * the sense's last type; if nothing in the band fits the word, a neighboring band is used.
 */
export function chooseQuestionType(args: {
  sense: EngineSense;
  card: CardKind;
  stability: number;
  lastType: QuestionType | null;
  /** Whether this device can play audio (a recording or the browser's voice). */
  audio: boolean;
  /** Commonly confused senses that also have a production card. */
  contrastPartners: readonly number[];
  pool?: readonly EngineSense[];
  rng: Rng;
}): QuestionType {
  const { sense, card, lastType, rng } = args;
  const band = bandFor(args.stability);

  if (
    card === "production" &&
    band !== "low" &&
    sense.examples.length > 0 &&
    args.contrastPartners.some((id) => !args.pool || args.pool.some((s) => s.id === id)) &&
    lastType !== "contrast_choice" &&
    rng() < ENGINE_CONFIG.questions.contrastRate
  ) {
    return "contrast_choice";
  }

  const all = Object.keys(QUESTION_TYPES) as QuestionType[];
  let fallback: QuestionType | null = null;
  for (const b of FALLBACK_ORDER[band]) {
    const options = all.filter(
      (t) =>
        QUESTION_TYPES[t].card === card &&
        (QUESTION_TYPES[t].bands as readonly Band[]).includes(b) &&
        fits(t, sense, args),
    );
    const fresh = options.filter((t) => t !== lastType);
    if (fresh.length > 0) return fresh[Math.floor(rng() * fresh.length)]!;
    fallback ??= options[0] ?? null;
  }
  // Only the last type fits anywhere: repeating it beats asking nothing.
  return fallback ?? (card === "recognition" ? "meaning_choice" : "word_choice");
}

export type QuestionOption = { text: string; lang: "es" | "en"; senseId: number | null };

export type Question = {
  type: QuestionType;
  senseId: number;
  card: CardKind;
  mode: AnswerMode;
  instruction: string;
  prompt: {
    text: string;
    lang: "es" | "en";
    /** For listening questions: play the word or the sentence instead of showing it. */
    audio: "word" | "sentence" | null;
    /** The blank in a cloze sentence (character offsets). */
    gap?: { start: number; end: number };
  };
  /** Choice questions only. The UI adds "I don't know" to every question. */
  options: QuestionOption[] | null;
  correctIndex: number | null;
  /** Typed questions only. */
  expected: string | null;
  dictionaryForm: string | null;
  article: EngineSense["article"];
  exampleId: number | null;
  note: string | null;
  /** Other senses this question also reviews (contrast questions). */
  alsoReviews: number[];
};

/** Nouns always display with their article. */
export function displayWord(s: EngineSense): string {
  return s.article ? `${s.article} ${s.headword}` : s.headword;
}

const MAY_BE_CONJUGATED = "The answer may be conjugated.";

function choice(
  correct: QuestionOption,
  wrong: QuestionOption[],
  rng: Rng,
): { options: QuestionOption[]; correctIndex: number } {
  const options = shuffle([correct, ...wrong], rng);
  return { options, correctIndex: options.indexOf(correct) };
}

export function buildQuestion(args: {
  type: QuestionType;
  sense: EngineSense;
  pool: readonly EngineSense[];
  rng: Rng;
  contrastPartnerId?: number;
}): Question {
  const { type, sense, pool, rng } = args;
  const info = QUESTION_TYPES[type];
  // Multiple-choice cloze prefers sentences with reviewed distractors.
  const withDistractors = sense.examples.filter((e) => e.distractors.length === 3);
  const examples =
    type === "cloze_choice" && withDistractors.length > 0 ? withDistractors : sense.examples;
  const example: EngineExample | undefined = examples.length
    ? examples[Math.floor(rng() * examples.length)]
    : undefined;
  const gapPrompt = (audio: "sentence" | null) => ({
    text: example!.text,
    lang: "es" as const,
    audio,
    gap: { start: example!.start, end: example!.end },
  });
  const base = {
    type,
    senseId: sense.id,
    card: info.card,
    mode: info.mode,
    options: null,
    correctIndex: null,
    expected: null,
    dictionaryForm: null,
    article: null,
    exampleId: null,
    note: null,
    alsoReviews: [],
  } satisfies Partial<Question>;
  const es = (s: EngineSense): QuestionOption => ({
    text: displayWord(s),
    lang: "es",
    senseId: s.id,
  });
  const en = (s: EngineSense): QuestionOption => ({ text: s.gloss, lang: "en", senseId: s.id });

  switch (type) {
    case "meaning_choice":
    case "listen_meaning_choice":
      return {
        ...base,
        instruction: "What does this mean?",
        prompt: {
          text: displayWord(sense),
          lang: "es",
          audio: type === "listen_meaning_choice" ? "word" : null,
        },
        ...choice(en(sense), pickDistractors(sense, pool, rng).map(en), rng),
      };

    case "word_choice":
      return {
        ...base,
        instruction: "Pick the Spanish word.",
        prompt: { text: sense.gloss, lang: "en", audio: null },
        ...choice(es(sense), pickDistractors(sense, pool, rng).map(es), rng),
      };

    case "cloze_choice": {
      const stored = example!.distractors;
      if (stored.length === 3) {
        return {
          ...base,
          instruction: "Pick the word that fills the gap.",
          prompt: gapPrompt(null),
          exampleId: example!.id,
          ...choice(
            { text: example!.surfaceForm, lang: "es", senseId: sense.id },
            stored.map((text) => ({ text, lang: "es" as const, senseId: null })),
            rng,
          ),
        };
      }
      const wrong = pickDistractors(sense, pool, rng).map((s) => ({
        text: s.headword,
        lang: "es" as const,
        senseId: s.id,
      }));
      return {
        ...base,
        instruction: "Pick the word that fills the gap.",
        prompt: gapPrompt(null),
        exampleId: example!.id,
        note: MAY_BE_CONJUGATED,
        ...choice({ text: sense.headword, lang: "es", senseId: sense.id }, wrong, rng),
      };
    }

    case "relation_choice": {
      const related = pool.filter(
        (s) => sense.synonymIds.includes(s.id) || sense.antonymIds.includes(s.id),
      );
      const answer = related[Math.floor(rng() * related.length)]!;
      const synonym = sense.synonymIds.includes(answer.id);
      const exclude = new Set([...sense.synonymIds, ...sense.antonymIds]);
      return {
        ...base,
        instruction: synonym ? "Pick the word with the same meaning." : "Pick the opposite.",
        prompt: { text: displayWord(sense), lang: "es", audio: null },
        ...choice(es(answer), pickDistractors(sense, pool, rng, 3, exclude).map(es), rng),
      };
    }

    case "gender_choice":
      return {
        ...base,
        instruction: "Which article goes with this word?",
        prompt: { text: sense.headword, lang: "es", audio: null },
        options: [
          { text: "el", lang: "es", senseId: null },
          { text: "la", lang: "es", senseId: null },
        ],
        correctIndex: sense.article === "el" ? 0 : 1,
      };

    case "usage_choice": {
      const misuses = shuffle(sense.misuses, rng)
        .slice(0, 2)
        .map((text) => ({ text, lang: "es" as const, senseId: null }));
      return {
        ...base,
        instruction: "Which sentence uses the word correctly?",
        prompt: { text: displayWord(sense), lang: "es", audio: null },
        exampleId: example!.id,
        ...choice({ text: example!.text, lang: "es", senseId: sense.id }, misuses, rng),
      };
    }

    case "meaning_typed":
      return {
        ...base,
        instruction: "Type the Spanish word.",
        prompt: { text: sense.gloss, lang: "en", audio: null },
        expected: sense.headword,
        article: sense.article,
      };

    case "cloze_typed":
    case "listen_cloze_typed":
      return {
        ...base,
        instruction:
          type === "cloze_typed" ? "Type the missing word." : "Listen, then type the missing word.",
        prompt: gapPrompt(type === "listen_cloze_typed" ? "sentence" : null),
        exampleId: example!.id,
        expected: example!.surfaceForm,
        dictionaryForm: sense.headword,
      };

    case "contrast_choice": {
      const partner = pool.find((s) => s.id === args.contrastPartnerId);
      if (!partner || !example) throw new Error("contrast question needs a partner and an example");
      return {
        ...base,
        instruction: "Which word fits?",
        prompt: gapPrompt(null),
        exampleId: example.id,
        note: MAY_BE_CONJUGATED,
        alsoReviews: [partner.id],
        ...choice(
          { text: sense.headword, lang: "es", senseId: sense.id },
          [{ text: partner.headword, lang: "es", senseId: partner.id }],
          rng,
        ),
      };
    }
  }
}
