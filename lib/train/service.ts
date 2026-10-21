import { and, desc, eq, sql } from "drizzle-orm";
import { Rating, type Card, type Grade } from "ts-fsrs";
import { getDb } from "@/lib/db/client";
import {
  answerEvent,
  classroom,
  issuedQuestion,
  learnerProfile,
  seat,
  studySession,
  wordListItem,
} from "@/lib/db/schema";
import { updateAbility } from "@/lib/engine/ability";
import { checkTypedAnswer, normalizeAnswer, type NotePart } from "@/lib/engine/answer-check";
import { applyReview, isLearned, markKnown, newSenseMemory } from "@/lib/engine/cards";
import { ENGINE_CONFIG } from "@/lib/engine/config";
import { guessFirst, introQuestionType } from "@/lib/engine/intro";
import { chooseNextItem, newSession, recordAnswer } from "@/lib/engine/next-item";
import {
  buildQuestion,
  chooseQuestionType,
  QUESTION_TYPES,
  type Question,
} from "@/lib/engine/questions";
import { rateAnswer, responseThresholds } from "@/lib/engine/rating";
import type { EngineSense } from "@/lib/engine/types";
import { INTEGRITY_CONFIG } from "@/lib/integrity/config";
import { getTrainingContent, type TrainingContent } from "./content";
import { getProfile, loadProgress, saveProgress, type Progress, type Tx } from "./store";
import type {
  AnswerResponse,
  Feedback,
  IssuedPayload,
  PublicQuestion,
  Screen,
  SessionData,
  SessionSummary,
  Stage,
} from "./types";

// The training flow on the server: picks each screen with the engine, grades answers
// against the question as issued, updates the cards, and logs every graded answer.

export class TrainingError extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Where "now" comes from. Tests and the demo class pass a simulated clock. */
export type Clock = () => Date;
const realClock: Clock = () => new Date();

const APP_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
const WRONG_READ_MS = 3000;
const rng = Math.random;

type Ctx = {
  tx: Tx;
  userId: string;
  sessionId: string;
  data: SessionData;
  audio: boolean;
  content: TrainingContent;
  now: Date;
};

// --- Issuing screens ------------------------------------------------------------------

function publicQuestion(q: Question, sense: EngineSense, content: TrainingContent): PublicQuestion {
  const core = content.core.get(sense.id)!;
  const example = sense.examples.find((e) => q.prompt.gap && e.text === q.prompt.text);
  const listening = q.prompt.audio !== null;
  return {
    type: q.type,
    mode: q.mode,
    instruction: q.instruction,
    // A listening question hides the word itself; the sentence stays, with its gap.
    prompt: q.type === "listen_meaning_choice" ? { ...q.prompt, text: "" } : q.prompt,
    options: q.options?.map(({ text, lang }) => ({ text, lang })) ?? null,
    note: q.note,
    speak: listening
      ? q.prompt.audio === "sentence"
        ? { text: example?.text ?? q.prompt.text, audioUrl: null }
        : { text: core.display, audioUrl: core.lemmaAudioUrl }
      : null,
  };
}

async function issue(ctx: Ctx, payload: IssuedPayload): Promise<string> {
  const [row] = await ctx.tx
    .insert(issuedQuestion)
    .values({ studySessionId: ctx.sessionId, userId: ctx.userId, payload, issuedAt: ctx.now })
    .returning({ id: issuedQuestion.id });
  return row!.id;
}

async function questionScreen(
  ctx: Ctx,
  stage: Stage,
  item: IssuedPayload["item"],
  question: Question,
  extra: Partial<IssuedPayload> = {},
): Promise<Screen> {
  const sense = ctx.content.byId.get(question.senseId)!;
  const id = await issue(ctx, { stage, senseId: sense.id, item, question, ...extra });
  return { kind: "question", id, stage, question: publicQuestion(question, sense, ctx.content) };
}

async function introScreen(ctx: Ctx, senseId: number, abilityDone = false): Promise<Screen> {
  const item = { kind: "new", senseId } as const;
  const id = await issue(ctx, { stage: "intro", senseId, item, question: null, abilityDone });
  const sense = ctx.content.byId.get(senseId)!;
  return {
    kind: "intro",
    id,
    word: { ...ctx.content.core.get(senseId)!, partOfSpeech: sense.partOfSpeech },
  };
}

async function recentCorrect(tx: Tx, userId: string): Promise<boolean[]> {
  const rows = await tx
    .select({ correct: answerEvent.correct })
    .from(answerEvent)
    .where(and(eq(answerEvent.userId, userId), eq(answerEvent.isPretest, false)))
    .orderBy(desc(answerEvent.id))
    .limit(ENGINE_CONFIG.newWordGate.recentAnswers);
  return rows.map((r) => r.correct).reverse();
}

async function nextScreen(ctx: Ctx, activeMs: number, plannedMs: number): Promise<Screen> {
  // Time is up: the session ends after the current question.
  if (activeMs >= plannedMs) return { kind: "done" };

  const forced = ctx.data.forced.shift();
  if (forced?.stage === "intro") return introScreen(ctx, forced.senseId, forced.abilityDone);
  if (forced?.stage === "intro_check") {
    const sense = ctx.content.byId.get(forced.senseId)!;
    const q = buildQuestion({ type: "meaning_choice", sense, pool: ctx.content.senses, rng });
    return questionScreen(ctx, "intro_check", { kind: "new", senseId: sense.id }, q, {
      abilityDone: forced.abilityDone,
    });
  }

  const progress = await loadProgress(ctx.tx, ctx.userId);
  const memories = new Map([...progress].map(([id, p]) => [id, p.memory]));
  const profile = await getProfile(ctx.tx, ctx.userId);
  const firstRank = (profile.startLevel - 1) * ENGINE_CONFIG.levelBandSize + 1;
  // A class focus list's words come first, at any level (spec: Class settings); then the
  // bank in frequency order from the student's starting level.
  const newWords: number[] = [];
  for (const id of ctx.data.focus ?? []) {
    // A focus word retired since the session started is skipped.
    if (!ctx.content.byId.has(id)) continue;
    if (!memories.has(id) && !newWords.includes(id)) newWords.push(id);
    if (newWords.length === 10) break;
  }
  for (const id of ctx.content.order) {
    if (newWords.length >= 10) break;
    const s = ctx.content.byId.get(id)!;
    if (s.frequencyRank >= firstRank && !memories.has(id) && !newWords.includes(id))
      newWords.push(id);
  }

  // A word that stopped being live mid-session is dropped from the waiting lists.
  const live = (p: { senseId: number }) => ctx.content.byId.has(p.senseId);
  ctx.data.engine.pendingMisses = ctx.data.engine.pendingMisses.filter(live);
  ctx.data.engine.pendingSecondChecks = ctx.data.engine.pendingSecondChecks.filter(live);

  const item = chooseNextItem({
    session: ctx.data.engine,
    // Only senses that are still live can be asked.
    memories: new Map([...memories].filter(([id]) => ctx.content.byId.has(id))),
    now: ctx.now,
    recentCorrect: await recentCorrect(ctx.tx, ctx.userId),
    newWords,
  });
  if (!item) return { kind: "done" };
  const sense = ctx.content.byId.get(item.senseId)!;

  if (item.kind === "new") {
    if (guessFirst(sense)) {
      ctx.data.forced.unshift({ stage: "intro", senseId: sense.id });
      const q = buildQuestion({ type: "meaning_choice", sense, pool: ctx.content.senses, rng });
      return questionScreen(ctx, "pretest", item, q);
    }
    return introScreen(ctx, sense.id);
  }

  const p = progress.get(sense.id)!;
  const c = p.memory[item.card]!;
  const partners = sense.confusedIds.filter((id) => progress.get(id)?.memory.production);
  const type = chooseQuestionType({
    sense,
    card: item.card,
    stability: c.stability,
    lastType: p.lastType,
    audio: ctx.audio,
    contrastPartners: partners,
    pool: ctx.content.senses,
    rng,
  });
  const question = buildQuestion({
    type,
    sense,
    pool: ctx.content.senses,
    rng,
    contrastPartnerId: partners[Math.floor(rng() * partners.length)],
  });
  return questionScreen(ctx, "review", item, question);
}

// --- Session lifecycle ----------------------------------------------------------------

/** A class student's settings come from their most recently joined class. */
async function classSettingsFor(tx: Tx, userId: string, content: TrainingContent) {
  const [c] = await tx
    .select({ sessionMinutes: classroom.sessionMinutes, focusListId: classroom.focusListId })
    .from(seat)
    .innerJoin(classroom, eq(seat.classroomId, classroom.id))
    .where(eq(seat.studentId, userId))
    .orderBy(desc(seat.joinedAt))
    .limit(1);
  if (!c) return { sessionMinutes: null, focus: [] as number[] };
  const focus = c.focusListId
    ? (
        await tx
          .select({ senseId: wordListItem.senseId })
          .from(wordListItem)
          .where(eq(wordListItem.listId, c.focusListId))
          .orderBy(wordListItem.position)
      )
        .map((r) => r.senseId)
        .filter((id) => content.byId.has(id))
    : [];
  return { sessionMinutes: c.sessionMinutes, focus };
}

export async function startSession(
  userId: string,
  opts: { audio: boolean; minutes?: number },
  clock: Clock = realClock,
): Promise<{ sessionId: string; plannedMs: number; screen: Screen }> {
  const content = await getTrainingContent();
  const now = clock();
  return getDb().transaction(async (tx) => {
    await getProfile(tx, userId);
    const classSettings = await classSettingsFor(tx, userId, content);
    const plannedMinutes =
      opts.minutes ?? classSettings.sessionMinutes ?? ENGINE_CONFIG.session.defaultMinutes;
    // One open session per account: starting a new one ends any other.
    await tx
      .update(studySession)
      .set({ endedAt: now })
      .where(and(eq(studySession.userId, userId), sql`${studySession.endedAt} IS NULL`));
    const data: SessionData = { engine: newSession(), forced: [], focus: classSettings.focus };
    const [row] = await tx
      .insert(studySession)
      .values({ userId, plannedMinutes, state: data, audio: opts.audio, startedAt: now })
      .returning({ id: studySession.id });
    const ctx: Ctx = {
      tx,
      userId,
      sessionId: row!.id,
      data,
      audio: opts.audio,
      content,
      now,
    };
    const plannedMs = plannedMinutes * 60_000;
    const screen = await nextScreen(ctx, 0, plannedMs);
    await tx.update(studySession).set({ state: ctx.data }).where(eq(studySession.id, row!.id));
    return { sessionId: row!.id, plannedMs, screen };
  });
}

async function lockIssued(tx: Tx, userId: string, questionId: string) {
  const [issued] = await tx
    .select()
    .from(issuedQuestion)
    .where(and(eq(issuedQuestion.id, questionId), eq(issuedQuestion.userId, userId)))
    .for("update");
  if (!issued) throw new TrainingError(404, "question not found");
  const [session] = await tx
    .select()
    .from(studySession)
    .where(eq(studySession.id, issued.studySessionId))
    .for("update");
  if (!session) throw new TrainingError(404, "session not found");
  return { issued, session };
}

function capActive(ms: number, mode: "choice" | "typed"): number {
  return Math.max(0, Math.min(ms, INTEGRITY_CONFIG.maxScreenMs[mode]));
}

/** The student picked Got it or I already know this on a new word's page. */
export async function chooseIntro(
  userId: string,
  body: { questionId: string; choice: "got_it" | "already_know"; activeMs: number },
  clock: Clock = realClock,
): Promise<{ next: Screen; activeMs: number; plannedMs: number }> {
  const content = await getTrainingContent();
  return getDb().transaction(async (tx) => {
    const { issued, session } = await lockIssued(tx, userId, body.questionId);
    if (issued.answeredAt)
      return issued.response as { next: Screen; activeMs: number; plannedMs: number };
    if (session.endedAt) throw new TrainingError(409, "session has ended");
    const payload = issued.payload as IssuedPayload;
    if (payload.stage !== "intro") throw new TrainingError(409, "not a word page");
    const sense = content.byId.get(payload.senseId);
    if (!sense) throw new TrainingError(409, "word is no longer available");

    const ctx: Ctx = {
      tx,
      userId,
      sessionId: session.id,
      data: session.state as SessionData,
      audio: session.audio,
      content,
      now: clock(),
    };
    const type = introQuestionType(body.choice, sense);
    const question = buildQuestion({ type, sense, pool: content.senses, rng });
    const stage = body.choice === "got_it" ? "intro_check" : "intro_known";
    const next = await questionScreen(ctx, stage, payload.item, question, {
      abilityDone: payload.abilityDone,
    });

    const activeMs = session.activeMs + capActive(body.activeMs, "choice");
    const response = { next, activeMs, plannedMs: session.plannedMinutes * 60_000 };
    await tx
      .update(issuedQuestion)
      .set({ answeredAt: ctx.now, response })
      .where(eq(issuedQuestion.id, issued.id));
    await tx
      .update(studySession)
      .set({ activeMs, state: ctx.data })
      .where(eq(studySession.id, session.id));
    return response;
  });
}

export type AnswerInput = {
  questionId: string;
  clientAnswerId: string;
  chosenIndex?: number;
  typed?: string;
  dontKnow?: boolean;
  responseMs: number;
  activeMs: number;
};

function cardSnapshot(c: Card | null | undefined) {
  return c
    ? { ...c, due: c.due.toISOString(), last_review: c.last_review?.toISOString() ?? null }
    : null;
}

export async function answerQuestion(
  userId: string,
  input: AnswerInput,
  clock: Clock = realClock,
): Promise<AnswerResponse> {
  const content = await getTrainingContent();
  const receivedAt = clock();
  return getDb().transaction(async (tx) => {
    const { issued, session } = await lockIssued(tx, userId, input.questionId);
    if (issued.answeredAt) {
      // A retry of an answer we already have: same reply, nothing counted twice.
      if (issued.clientAnswerId === input.clientAnswerId) return issued.response as AnswerResponse;
      throw new TrainingError(409, "question already answered");
    }
    if (session.endedAt) throw new TrainingError(409, "session has ended");
    const payload = issued.payload as IssuedPayload;
    const q = payload.question;
    if (!q) throw new TrainingError(409, "not a question");
    const sense = content.byId.get(payload.senseId);
    if (!sense) throw new TrainingError(409, "word is no longer available");

    const ctx: Ctx = {
      tx,
      userId,
      sessionId: session.id,
      data: session.state as SessionData,
      audio: session.audio,
      content,
      now: receivedAt,
    };
    const progress = await loadProgress(tx, userId);
    const current: Progress | undefined = progress.get(sense.id);

    // --- Grade against the question as issued.
    const dontKnow = input.dontKnow === true;
    let grade: Feedback["grade"];
    let reason: string | null = null;
    let note: NotePart[] | null = q.note ? [{ text: q.note }] : null;
    let correctAnswer: string;
    let correctAnswerLang: "es" | "en" = "es";
    let chosenMeaning: NotePart[] | null = null;
    if (q.mode === "choice") {
      correctAnswer = q.options![q.correctIndex!]!.text;
      correctAnswerLang = q.options![q.correctIndex!]!.lang;
      const chosen = input.chosenIndex === undefined ? undefined : q.options![input.chosenIndex];
      grade = !dontKnow && input.chosenIndex === q.correctIndex ? "correct" : "wrong";
      if (grade === "wrong" && chosen?.senseId && chosen.senseId !== sense.id) {
        const other = content.core.get(chosen.senseId);
        if (other) {
          chosenMeaning =
            chosen.lang === "es"
              ? [{ text: chosen.text, lang: "es" }, { text: ` means ${other.gloss}` }]
              : [{ text: `"${chosen.text}" is ` }, { text: other.display, lang: "es" }];
        }
      }
    } else {
      const expected = q.expected!;
      const result = checkTypedAnswer({
        typed: dontKnow ? "" : (input.typed ?? ""),
        expected,
        mode: q.type === "meaning_typed" ? "word" : "cloze",
        article: q.article,
        dictionaryForm: q.dictionaryForm ?? undefined,
        productionStabilityDays: current?.memory.production?.stability ?? 0,
        learned: current ? isLearned(current.memory, receivedAt) : false,
        isOtherWord: (form) => form !== normalizeAnswer(expected) && content.forms.has(form),
      });
      grade = result.grade;
      reason = result.reason;
      note = result.noteParts ?? note;
      correctAnswer = result.correctAnswer;
    }
    const correct = grade !== "wrong";

    // --- Rate and schedule.
    const mode = QUESTION_TYPES[q.type].mode;
    const pastTimes = await tx
      .select({ ms: answerEvent.clientResponseMs })
      .from(answerEvent)
      .where(and(eq(answerEvent.userId, userId), eq(answerEvent.questionType, q.type)))
      .orderBy(desc(answerEvent.id))
      .limit(50);
    const rating: Grade = rateAnswer({
      outcome: dontKnow ? "dont_know" : grade === "hard" ? "hard" : correct ? "correct" : "wrong",
      mode,
      responseMs: input.responseMs,
      usedHint: false,
      thresholds: responseThresholds(
        pastTimes.map((r) => r.ms),
        mode,
      ),
    });

    let loggedRating: Grade | null = rating;
    let before: Card | null | undefined = current?.memory[q.card];
    let after: Card | null | undefined = null;
    let knownAlready = false;
    let introDone = false;

    const firstExposure = async (knew: boolean) => {
      // Owner's decision: the ability score moves only on first exposures (DECISIONS.md).
      if (payload.abilityDone) return;
      const [profile] = await tx
        .select()
        .from(learnerProfile)
        .where(eq(learnerProfile.userId, userId))
        .for("update");
      const next = updateAbility(
        { ability: profile!.ability, answers: profile!.abilityAnswers },
        Math.log(sense.frequencyRank),
        "typed",
        knew,
      ).state;
      await tx
        .update(learnerProfile)
        .set({ ability: next.ability, abilityAnswers: next.answers })
        .where(eq(learnerProfile.userId, userId));
    };

    switch (payload.stage) {
      case "pretest":
        loggedRating = null; // a guess-first pretest is logged but changes no card
        break;
      case "review": {
        const memory = applyReview(current!.memory, q.card, rating, receivedAt).memory;
        after = memory[q.card];
        await saveProgress(tx, userId, sense.id, memory, q.type, receivedAt);
        for (const partnerId of q.alsoReviews) {
          const partner = progress.get(partnerId);
          if (partner?.memory.production) {
            const m = applyReview(partner.memory, "production", rating, receivedAt).memory;
            await saveProgress(tx, userId, partnerId, m, partner.lastType, receivedAt);
          }
        }
        break;
      }
      case "intro_check": {
        before = null;
        const memory = applyReview(
          newSenseMemory(receivedAt),
          "recognition",
          rating,
          receivedAt,
        ).memory;
        after = memory.recognition;
        await saveProgress(tx, userId, sense.id, memory, q.type, receivedAt);
        await firstExposure(false);
        introDone = true;
        break;
      }
      case "intro_known":
        before = null;
        await firstExposure(correct);
        if (correct) {
          // markKnown rates both cards Easy; log what was actually scheduled for the card
          // this production question tests.
          const memory = markKnown(newSenseMemory(receivedAt), receivedAt);
          loggedRating = Rating.Easy;
          after = memory.production;
          await saveProgress(tx, userId, sense.id, memory, q.type, receivedAt);
          knownAlready = true;
          introDone = true;
        } else {
          // Wrong: show the word page again (in the feedback) and continue as a new word.
          loggedRating = null;
          ctx.data.forced.unshift({ stage: "intro_check", senseId: sense.id, abilityDone: true });
        }
        break;
      case "intro":
        throw new TrainingError(409, "not a question");
    }

    const countedMs = capActive(input.activeMs, mode);
    await tx.insert(answerEvent).values({
      clientAnswerId: input.clientAnswerId,
      userId,
      senseId: sense.id,
      exampleId: q.exampleId,
      studySessionId: session.id,
      questionType: q.type,
      cardKind: payload.stage === "pretest" ? null : q.card,
      options: q.options,
      chosenIndex: q.mode === "choice" ? (input.chosenIndex ?? null) : null,
      typedText: q.mode === "typed" && !dontKnow ? (input.typed ?? "").slice(0, 40) : null,
      dontKnow,
      grade,
      gradeReason: reason,
      correct,
      rating: loggedRating,
      isPretest: payload.stage === "pretest",
      fsrsBefore: cardSnapshot(before),
      fsrsAfter: cardSnapshot(after),
      fsrsParamsVersion: ENGINE_CONFIG.fsrs.paramsVersion,
      clientResponseMs: Math.max(0, Math.round(input.responseMs)),
      activeMs: countedMs,
      serverIssuedAt: issued.issuedAt,
      serverReceivedAt: receivedAt,
      appVersion: APP_VERSION,
    });

    // --- Advance the session.
    if (payload.stage === "review") {
      ctx.data.engine = recordAnswer(ctx.data.engine, payload.item, { correct, rng });
    } else if (introDone) {
      ctx.data.engine = recordAnswer(ctx.data.engine, payload.item, {
        correct,
        rng,
        knownAlready,
      });
    }
    const activeMs = session.activeMs + countedMs;
    const plannedMs = session.plannedMinutes * 60_000;
    const next = await nextScreen(ctx, activeMs, plannedMs);

    const response: AnswerResponse = {
      feedback: {
        correct,
        grade,
        note,
        correctAnswer,
        correctAnswerLang,
        chosenMeaning,
        word: content.core.get(sense.id)!,
        requiredReadMs: correct ? 0 : WRONG_READ_MS,
        pretest: payload.stage === "pretest",
      },
      next,
      activeMs,
      plannedMs,
    };
    await tx
      .update(issuedQuestion)
      .set({ answeredAt: receivedAt, clientAnswerId: input.clientAnswerId, response })
      .where(eq(issuedQuestion.id, issued.id));
    await tx
      .update(studySession)
      .set({ activeMs, state: ctx.data })
      .where(eq(studySession.id, session.id));
    return response;
  });
}

export async function endSession(
  userId: string,
  sessionId: string,
  /** Visible time since the last answer (the last feedback screen, or an unanswered one). */
  activeMs = 0,
  clock: Clock = realClock,
): Promise<SessionSummary> {
  const db = getDb();
  const [found] = await db
    .select()
    .from(studySession)
    .where(and(eq(studySession.id, sessionId), eq(studySession.userId, userId)));
  if (!found) throw new TrainingError(404, "session not found");
  let session = found;
  if (!session.endedAt) {
    // Attentive time on the last screen counts too, with the same per-screen cap.
    const [updated] = await db
      .update(studySession)
      .set({ endedAt: clock(), activeMs: session.activeMs + capActive(activeMs, "choice") })
      .where(eq(studySession.id, sessionId))
      .returning();
    session = updated!;
  }

  const content = await getTrainingContent();
  const answers = await db
    .select({ senseId: answerEvent.senseId, correct: answerEvent.correct })
    .from(answerEvent)
    .where(and(eq(answerEvent.studySessionId, sessionId), eq(answerEvent.isPretest, false)))
    .orderBy(answerEvent.id);
  const bySense = new Map<number, boolean[]>();
  for (const a of answers) bySense.set(a.senseId, [...(bySense.get(a.senseId) ?? []), a.correct]);

  return {
    activeMinutes: Math.round(session.activeMs / 6_000) / 10,
    questions: answers.length,
    accuracy: answers.length
      ? Math.round((100 * answers.filter((a) => a.correct).length) / answers.length)
      : null,
    newWords: (session.state as SessionData).engine.newIntroduced,
    words: [...bySense].map(([senseId, results]) => {
      const core = content.core.get(senseId);
      return {
        senseId,
        display: core?.display ?? "",
        gloss: core?.gloss ?? "",
        results,
      };
    }),
  };
}
