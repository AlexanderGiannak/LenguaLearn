import { Rating, State, type Card } from "ts-fsrs";
import { estimateVocabularySize, updateAbility, type AbilityState } from "../ability.ts";
import {
  applyReview,
  isLearned,
  markKnown,
  newSenseMemory,
  recall,
  scheduler,
  type CardKind,
  type SenseMemory,
} from "../cards.ts";
import { ENGINE_CONFIG } from "../config.ts";
import { guessFirst } from "../intro.ts";
import { chooseNextItem, countOverdue, newSession, recordAnswer } from "../next-item.ts";
import { chooseQuestionType, QUESTION_TYPES, type QuestionType } from "../questions.ts";
import { rateAnswer, responseThresholds, type AnswerMode } from "../rating.ts";
import { seededRng, type EngineSense, type Rng } from "../types.ts";

// Runs synthetic learners through the real engine (next-item choice, question types,
// ratings, FSRS) to see the workload it produces. The words are synthetic placeholders.
//
// The learner model is deliberately simple. True recall follows the FSRS forgetting curve,
// with each learner's stability scaled by a personal memory factor, so this measures
// workload and pacing, not how accurate FSRS is. Intermediate learners already know some
// words, more often the more frequent the word.

const DAY_MS = 86_400_000;

export type Cohort = "beginner" | "intermediate";

export type SimOptions = {
  cohort: Cohort;
  learners: number;
  days: number;
  seed: number;
  /** Training days per week (Monday first); a school week by default. */
  trainingDaysPerWeek: number;
  sessionMinutes: number;
  /** Infinity models one card per sense, for the spec's two-card cost check. */
  productionUnlockStabilityDays: number;
};

export type DayStats = {
  day: number;
  trained: boolean;
  newWords: number;
  /** Cards due when the session started. */
  backlogAtStart: number;
  answers: number;
  correct: number;
  activeMinutes: number;
  learned: number;
  hitNewWordCap: boolean;
};

export type LearnerResult = {
  memoryFactor: number;
  knownRank: number;
  startLevel: number;
  days: DayStats[];
  learnedAtEnd: number;
  studiedAtEnd: number;
  totalMinutes: number;
  /** The spec's estimate: ability updated after every graded answer. */
  vocabularyEstimate: number;
  /** Alternative: ability updated only on first exposures to a word. */
  vocabularyEstimateFirstExposure: number;
  /** What the simulated learner actually knows: expected recall over ranks up to the bank size. */
  trueVocabulary: number;
};

// --- Synthetic bank -----------------------------------------------------------------

const POS = ["noun", "noun", "noun", "noun", "verb", "verb", "adjective", "adjective", "adverb"];

export function buildBank(size: number, seed: number): EngineSense[] {
  const rng = seededRng(seed);
  const bank: EngineSense[] = [];
  for (let rank = 1; rank <= size; rank++) {
    const pos = POS[Math.floor(rng() * POS.length)]!;
    const headword = `w${rank}`;
    const examples = [0, 1].map((i) => ({
      id: rank * 10 + i,
      text: `s${i} ${headword} e`,
      surfaceForm: headword,
      start: 3,
      end: 3 + headword.length,
      distractors: rng() < 0.8 ? ["d1", "d2", "d3"] : [],
    }));
    const near = () => Math.max(1, Math.min(size, rank + Math.round((rng() - 0.5) * 200)));
    bank.push({
      id: rank,
      lemmaId: rank,
      headword,
      partOfSpeech: pos,
      article: pos === "noun" ? (rng() < 0.05 ? "el/la" : rng() < 0.5 ? "el" : "la") : null,
      gloss: `g${rank}`,
      frequencyRank: rank,
      level: Math.floor((rank - 1) / ENGINE_CONFIG.levelBandSize) + 1,
      difficulty: null,
      cognate: rng() < 0.1 ? "true_cognate" : "none",
      hasWordParts: rng() < 0.08,
      synonymIds: rng() < 0.1 ? [near()] : [],
      antonymIds: rng() < 0.05 ? [near()] : [],
      familyIds: [],
      confusedIds: [],
      examples,
      // Assumes the content pipeline supplies reviewed misuse sentences for every word.
      misuses: ["m1", "m2"],
    });
  }
  return bank;
}

// --- Learner ------------------------------------------------------------------------

function logNormal(rng: Rng, median: number, sigma: number): number {
  // Box–Muller
  const u = Math.max(rng(), 1e-12);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  return median * Math.exp(sigma * z);
}

type Learner = {
  rng: Rng;
  memoryFactor: number;
  /** Rank where prior knowledge drops to 50%. */
  knownRank: number;
  priorKnown: Map<number, boolean>;
  memories: Map<number, SenseMemory>;
  lastType: Map<number, QuestionType>;
  ability: AbilityState;
  abilityFirstExposure: AbilityState;
  recentCorrect: boolean[];
  times: Record<AnswerMode, number[]>;
  nextRank: number;
};

function priorProbability(l: Learner, rank: number): number {
  return 1 / (1 + Math.exp(2 * (Math.log(rank) - Math.log(l.knownRank))));
}

function knowsBefore(l: Learner, rank: number): boolean {
  let known = l.priorKnown.get(rank);
  if (known === undefined) {
    known = l.rng() < priorProbability(l, rank);
    l.priorKnown.set(rank, known);
  }
  return known;
}

/** The simulated learner's actual chance of recalling one card right now. */
function trueRecall(l: Learner, sense: EngineSense, card: Card, kind: CardKind, now: Date) {
  const prior = knowsBefore(l, sense.frequencyRank);
  let p: number;
  if (card.state === State.New || !card.last_review) {
    p = 0.3; // a brand-new production card: they have only recognized the word so far
  } else {
    const elapsed = (now.getTime() - card.last_review.getTime()) / DAY_MS;
    const strength = card.stability * l.memoryFactor * (kind === "production" ? 0.85 : 1);
    p = scheduler.forgetting_curve(elapsed, Math.max(strength, 0.01));
  }
  if (prior) p = Math.max(p, kind === "recognition" ? 0.95 : 0.85);
  return p;
}

// --- One run --------------------------------------------------------------------------

export function simulateLearner(bank: EngineSense[], opts: SimOptions, index: number) {
  const rng = seededRng(opts.seed * 1000 + index);
  const memoryFactor = logNormal(rng, 1, 0.35);
  const knownRank =
    opts.cohort === "beginner" ? logNormal(rng, 30, 0.4) : logNormal(rng, 2000, 0.4);
  // Placement (Phase 7) is assumed to land at the level where they know about 80% of words.
  const startLevel =
    opts.cohort === "beginner"
      ? 1
      : Math.max(1, Math.floor((knownRank * 0.5) / ENGINE_CONFIG.levelBandSize) + 1);

  // Placement seeds the ability score (beginners skip the test).
  const seeded: AbilityState = {
    ability:
      opts.cohort === "beginner" ? ENGINE_CONFIG.ability.beginnerAbility : Math.log(knownRank),
    answers: 0,
  };
  const l: Learner = {
    rng,
    memoryFactor,
    knownRank,
    priorKnown: new Map(),
    memories: new Map(),
    lastType: new Map(),
    ability: seeded,
    abilityFirstExposure: seeded,
    recentCorrect: [],
    times: { choice: [], typed: [] },
    nextRank: (startLevel - 1) * ENGINE_CONFIG.levelBandSize + 1,
  };
  const unlock = opts.productionUnlockStabilityDays;
  const start = Date.UTC(2026, 8, 7, 15); // a Monday, 15:00 UTC
  const days: DayStats[] = [];

  for (let day = 0; day < opts.days; day++) {
    const trained = day % 7 < opts.trainingDaysPerWeek;
    let now = new Date(start + day * DAY_MS);
    const stats: DayStats = {
      day,
      trained,
      newWords: 0,
      backlogAtStart: countOverdue(l.memories, now),
      answers: 0,
      correct: 0,
      activeMinutes: 0,
      learned: 0,
      hitNewWordCap: false,
    };

    if (trained) {
      let session = newSession();
      let activeSeconds = 0;
      const tick = (seconds: number) => {
        activeSeconds += seconds;
        now = new Date(now.getTime() + seconds * 1000);
      };

      while (activeSeconds < opts.sessionMinutes * 60) {
        const newWords: number[] = [];
        for (let r = l.nextRank; newWords.length < 5 && r <= bank.length; r++) {
          if (!l.memories.has(r)) newWords.push(r);
        }
        const item = chooseNextItem({
          session,
          memories: l.memories,
          now,
          recentCorrect: l.recentCorrect,
          newWords,
        });
        if (!item) break;
        const sense = bank[item.senseId - 1]!;
        let correct: boolean;
        let knownAlready = false;

        if (item.kind === "new") {
          l.nextRank = sense.frequencyRank + 1;
          if (guessFirst(sense)) tick(logNormal(rng, 5, 0.4)); // pretest: logged, no FSRS change
          tick(logNormal(rng, 15, 0.4)); // reading the word page
          let memory = newSenseMemory(now);
          const difficulty = Math.log(sense.frequencyRank);
          let claimed = false;
          if (knowsBefore(l, sense.frequencyRank) && rng() < 0.85) {
            // "I already know this" -> a production question.
            claimed = true;
            tick(logNormal(rng, 8, 0.45));
            knownAlready = rng() < 0.85;
            if (knownAlready) {
              memory =
                unlock === Infinity
                  ? applyReview(memory, "recognition", Rating.Easy, now, unlock).memory
                  : markKnown(memory, now);
            } else {
              tick(10); // the word page again
            }
          }
          if (!knownAlready) {
            // "Got it" -> an easy recognition question.
            const ms = logNormal(rng, 4000, 0.45);
            tick(ms / 1000);
            correct = rng() < 0.92;
            const rating = rateAnswer({
              outcome: correct ? "correct" : "wrong",
              mode: "choice",
              responseMs: ms,
              usedHint: false,
              thresholds: responseThresholds(l.times.choice, "choice"),
            });
            memory = applyReview(memory, "recognition", rating, now, unlock).memory;
            l.lastType.set(sense.id, "meaning_choice");
          } else {
            correct = true;
          }
          l.memories.set(sense.id, memory);
          stats.newWords += 1;
          // First exposure: a right "I already know this" is evidence of prior knowledge;
          // choosing "Got it" (or failing the check) is evidence against it.
          const knew = claimed && knownAlready;
          l.abilityFirstExposure = updateAbility(
            l.abilityFirstExposure,
            difficulty,
            "typed",
            knew,
          ).state;
          // The spec's rule: every graded answer, here the check and/or the intro question.
          if (claimed)
            l.ability = updateAbility(l.ability, difficulty, "typed", knownAlready).state;
          if (!knownAlready)
            l.ability = updateAbility(l.ability, difficulty, "choice", correct).state;
        } else {
          const memory = l.memories.get(sense.id)!;
          const card = memory[item.card]!;
          const type = chooseQuestionType({
            sense,
            card: item.card,
            stability: card.stability,
            lastType: l.lastType.get(sense.id) ?? null,
            audio: true,
            contrastPartners: [],
            rng,
          });
          const mode = QUESTION_TYPES[type].mode;
          const p = trueRecall(l, sense, card, item.card, now);
          // A student who does not know picks "I don't know" about half the time.
          const pCorrect = mode === "choice" ? p + (1 - p) * 0.25 * 0.5 : p * 0.95;
          correct = rng() < pCorrect;
          const slip = mode === "typed" && correct && rng() < 0.12; // accent, article, typo
          const ms = logNormal(rng, mode === "typed" ? 8000 : 4500, 0.45);
          const rating = rateAnswer({
            outcome: !correct ? "wrong" : slip ? "hard" : "correct",
            mode,
            responseMs: ms,
            usedHint: false,
            thresholds: responseThresholds(l.times[mode], mode),
          });
          l.times[mode].push(ms);
          if (l.times[mode].length > 200) l.times[mode].shift();
          l.memories.set(sense.id, applyReview(memory, item.card, rating, now, unlock).memory);
          l.lastType.set(sense.id, type);
          tick(ms / 1000);
          l.ability = updateAbility(l.ability, Math.log(sense.frequencyRank), mode, correct).state;
        }

        tick(correct ? 2 : 6); // feedback screen; a wrong answer has 3 s of required reading
        stats.answers += 1;
        stats.correct += correct ? 1 : 0;
        l.recentCorrect.push(correct);
        if (l.recentCorrect.length > 50) l.recentCorrect.shift();
        session = recordAnswer(session, item, { correct, rng, knownAlready });
      }
      stats.activeMinutes = activeSeconds / 60;
      stats.hitNewWordCap = session.newIntroduced >= ENGINE_CONFIG.newWordGate.maxNewPerSession;
    }

    const endOfDay = new Date(start + day * DAY_MS + 8 * 3_600_000);
    stats.learned = [...l.memories.values()].filter((m) => isLearned(m, endOfDay)).length;
    days.push(stats);
  }

  const end = new Date(start + opts.days * DAY_MS);
  const studied = [...l.memories].map(([id, m]) => ({
    rank: bank[id - 1]!.frequencyRank,
    recall: recall(m.recognition, end),
  }));
  let trueVocabulary = 0;
  for (let rank = 1; rank <= ENGINE_CONFIG.ability.vocabularyMaxRank; rank++) {
    const m = l.memories.get(rank);
    trueVocabulary += m
      ? trueRecall(l, bank[rank - 1]!, m.recognition, "recognition", end)
      : priorProbability(l, rank);
  }
  return {
    memoryFactor,
    knownRank,
    startLevel,
    days,
    learnedAtEnd: days.at(-1)?.learned ?? 0,
    studiedAtEnd: l.memories.size,
    totalMinutes: days.reduce((sum, d) => sum + d.activeMinutes, 0),
    vocabularyEstimate: estimateVocabularySize({ ability: l.ability.ability, studied }),
    vocabularyEstimateFirstExposure: estimateVocabularySize({
      ability: l.abilityFirstExposure.ability,
      studied,
    }),
    trueVocabulary: Math.round(trueVocabulary),
  } satisfies LearnerResult;
}

export function simulate(opts: SimOptions, bank = buildBank(8000, opts.seed)): LearnerResult[] {
  return Array.from({ length: opts.learners }, (_, i) => simulateLearner(bank, opts, i));
}
