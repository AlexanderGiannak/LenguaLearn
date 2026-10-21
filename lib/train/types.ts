import type { NotePart } from "@/lib/engine/answer-check";
import type { NextItem, SessionState } from "@/lib/engine/next-item";
import type { Question, QuestionType } from "@/lib/engine/questions";
import type { WordCore } from "./content";

// Shapes shared by the training API and the training UI. Anything sent to the browser
// leaves out the correct answer.

/** Where a screen sits in the flow. */
export type Stage =
  | "review" // a scheduled or missed item
  | "pretest" // guess-first: logged, changes no card
  | "intro" // the word page with Got it / I already know this
  | "intro_check" // the easy recognition question after Got it
  | "intro_known"; // the production question after I already know this

/** Stored with each issued question (server only). */
export type IssuedPayload = {
  stage: Stage;
  senseId: number;
  item: Exclude<NextItem, null>;
  question: Question | null;
  /** The ability score was already updated for this word's first exposure. */
  abilityDone?: boolean;
};

/** Stored on the study session (server only). */
export type SessionData = {
  engine: SessionState;
  /** Screens that must come next, before the engine picks again (the new-word flow). */
  forced: { stage: "intro" | "intro_check"; senseId: number; abilityDone?: boolean }[];
  /** The class focus list's senses, introduced before other new words. */
  focus?: number[];
};

export type PublicQuestion = {
  type: QuestionType;
  mode: "choice" | "typed";
  instruction: string;
  prompt: Question["prompt"];
  options: { text: string; lang: "es" | "en" }[] | null;
  note: string | null;
  /** What the speaker button says, and the recording to play first, if there is one. */
  speak: { text: string; audioUrl: string | null } | null;
};

export type Screen =
  | { kind: "question"; id: string; stage: Stage; question: PublicQuestion }
  | { kind: "intro"; id: string; word: WordCore & { partOfSpeech: string } }
  | { kind: "done" };

export type Feedback = {
  correct: boolean;
  grade: "correct" | "hard" | "wrong";
  /** Feedback line in parts; Spanish parts carry lang "es". */
  note: NotePart[] | null;
  correctAnswer: string;
  correctAnswerLang: "es" | "en";
  /** For a wrong pick: what the chosen option actually means, in parts. */
  chosenMeaning: NotePart[] | null;
  word: WordCore;
  /** A wrong answer must be read for this long before Continue is enabled. */
  requiredReadMs: number;
  pretest: boolean;
};

export type AnswerResponse = {
  feedback: Feedback;
  next: Screen;
  activeMs: number;
  plannedMs: number;
};

export type SessionSummary = {
  activeMinutes: number;
  questions: number;
  accuracy: number | null;
  newWords: number;
  words: { senseId: number; display: string; gloss: string; results: boolean[] }[];
};
