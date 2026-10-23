import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { signUp } from "@/lib/auth/accounts";
import { generateHandle, studentPlaceholderEmail } from "@/lib/auth/identifiers";
import { getDb } from "@/lib/db/client";
import { issuedQuestion, seat, user } from "@/lib/db/schema";
import { seededRng } from "@/lib/engine/types";
import { startPlacement } from "@/lib/train/placement";
import { answerQuestion, chooseIntro, endSession, startSession } from "@/lib/train/service";
import type { IssuedPayload, Screen } from "@/lib/train/types";
import { teacherScope } from "./scope";
import { localDay } from "./week";

// A demo class for local development, PR previews and the Phase 5 test (spec: "run a fake
// class of 25 seeded students through a simulated week"). Students train through the real
// training service with a simulated clock. Never available in production.

type Profile = {
  trainDays: number;
  accuracy: number;
  /** Share of the full session length this student trains. */
  length: number;
  /** Clicks through without reading in one session, so the integrity rules flag it. */
  rushes?: boolean;
};

// A realistic spread: many keep up, some fall behind, two rush through a session, and a
// couple never start.
function profileFor(i: number, n: number, rng: () => number): Profile {
  const share = i / n;
  if (share < 0.4) return { trainDays: 5, accuracy: 0.85 + rng() * 0.1, length: 1 };
  if (share < 0.64) return { trainDays: 4, accuracy: 0.75 + rng() * 0.1, length: 0.6 };
  if (share < 0.8) return { trainDays: 2, accuracy: 0.6 + rng() * 0.15, length: 0.5 };
  if (share < 0.88) return { trainDays: 3, accuracy: 0.8, length: 0.6, rushes: true };
  return { trainDays: 0, accuracy: 0, length: 0 };
}

async function correctAnswer(questionId: string) {
  const [row] = await getDb()
    .select()
    .from(issuedQuestion)
    .where(eq(issuedQuestion.id, questionId));
  return (row!.payload as IssuedPayload).question!;
}

/** One simulated session, answering through the real service. */
async function simulateSession(
  userId: string,
  start: Date,
  minutes: number,
  p: Profile,
  rng: () => number,
  rushing = false,
) {
  let t = start.getTime();
  const clock = () => new Date(t);
  const step = (ms: number) => {
    t += ms;
    return ms;
  };
  const { sessionId, screen: first } = await startSession(userId, { audio: false, minutes }, clock);
  let screen: Screen = first;
  for (let guard = 0; guard < 500 && screen.kind !== "done"; guard++) {
    if (screen.kind === "intro") {
      screen = (
        await chooseIntro(
          userId,
          { questionId: screen.id, choice: "got_it", activeMs: step(8000) },
          clock,
        )
      ).next;
      continue;
    }
    const q = await correctAnswer(screen.id);
    const right = rushing ? q.mode === "choice" && q.correctIndex === 0 : rng() < p.accuracy;
    // Rushing: always the first option, well under the reading time. The real integrity
    // rules then flag the stretch (fast and mostly wrong, same position repeatedly).
    const answer =
      q.mode === "choice"
        ? {
            chosenIndex: rushing
              ? 0
              : right
                ? q.correctIndex!
                : (q.correctIndex! + 1) % q.options!.length,
          }
        : { typed: right ? q.expected! : "nada" };
    const responseMs = rushing ? 450 + Math.floor(rng() * 250) : 2500 + Math.floor(rng() * 4000);
    screen = (
      await answerQuestion(
        userId,
        {
          questionId: screen.id,
          token: screen.token,
          clientAnswerId: randomUUID(),
          ...answer,
          responseMs,
          activeMs: step(responseMs + (rushing ? 3200 : 3000)),
        },
        clock,
      )
    ).next;
  }
  await endSession(userId, sessionId, step(2000), clock);
}

export async function seedDemoClass(opts: {
  students?: number;
  days?: number;
  minutesPerSession?: number;
  now?: Date;
  seed?: number;
}) {
  const { students = 25, days = 7, minutesPerSession = 3, now = new Date(), seed = 1 } = opts;
  const rng = seededRng(seed);
  const db = getDb();

  // A reserved .invalid address: the verification hook skips placeholder addresses, so no
  // email is attempted (production has no transport for a made-up teacher anyway).
  const email = `demo-teacher-${randomUUID().slice(0, 8)}@demo.invalid`;
  const password = "demo-teacher-password";
  await signUp({ role: "teacher", name: "Demo Teacher", email, password });
  const [teacher] = await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email))
    .returning();
  const scope = teacherScope(teacher!.id);
  const c = await scope.createClass({ name: "Demo class", seats: students });
  const seats = await scope.listSeats(c.id);

  // Demo students have no password: they exist only to fill the dashboard.
  const ids: string[] = [];
  for (const s of seats) {
    const id = randomUUID();
    await db.insert(user).values({
      id,
      name: generateHandle(),
      username: `${generateHandle()}-${id.slice(0, 4)}`,
      email: studentPlaceholderEmail(),
      emailVerified: true,
      role: "student",
    });
    await db
      .update(seat)
      .set({ studentId: id, code: null, codeKind: null, joinedAt: now })
      .where(eq(seat.id, s.id));
    ids.push(id);
  }

  // School days only, oldest first, at staggered times in the class period.
  const dayStarts: Date[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 86_400_000 - 2 * 3_600_000);
    const weekday = new Date(`${localDay(day, c.timeZone)}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dayStarts.push(day);
  }
  for (const [i, id] of ids.entries()) {
    const p = profileFor(i, ids.length, rng);
    // The most recent school days of the window.
    const trainOn = dayStarts.slice(dayStarts.length - Math.min(p.trainDays, dayStarts.length));
    const minutes = Math.max(1, Math.round(minutesPerSession * p.length));
    for (const [d, day] of trainOn.entries()) {
      // A rusher rushes their most recent session, so it shows in this week's dashboard.
      const rushing = Boolean(p.rushes) && d === trainOn.length - 1;
      await simulateSession(id, new Date(day.getTime() + i * 60_000), minutes, p, rng, rushing);
    }
  }
  return {
    classId: c.id,
    teacherId: teacher!.id,
    teacherEmail: email,
    teacherPassword: password,
    studentIds: ids,
  };
}

/**
 * An independent learner who trained on most of the last `days` days, through the real
 * training service, so the learner pages have history to show. Same environments as the
 * demo class (never production).
 */
export async function seedDemoLearner(opts: { days?: number; now?: Date; seed?: number }) {
  const { days = 21, now = new Date(), seed = 1 } = opts;
  const rng = seededRng(seed);
  const username = `demo-learner-${randomUUID().slice(0, 6)}`;
  const password = "demo-learner-password";
  const res = await signUp({ role: "learner", username, password, ageConfirmed: true });
  const { user: created } = (await res.json()) as { user: { id: string } };
  await startPlacement(created.id, "beginner", "America/Chicago");
  // Accuracy climbs as the words settle, like a real first month.
  const p: Profile = { trainDays: days, accuracy: 0.7, length: 1 };
  for (let d = days - 1; d >= 0; d--) {
    // Skips about one day in four, but keeps the last three days for a current streak.
    if (d > 2 && rng() < 0.25) continue;
    p.accuracy = 0.7 + 0.2 * (1 - d / days);
    const start = new Date(now.getTime() - d * 86_400_000 - 3 * 3_600_000);
    const minutes = 5 + Math.round(rng() * 7);
    await simulateSession(created.id, start, minutes, p, rng);
  }
  return { userId: created.id, username, password };
}
