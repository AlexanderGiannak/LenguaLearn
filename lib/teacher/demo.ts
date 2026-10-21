import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { signUp } from "@/lib/auth/accounts";
import { generateHandle, studentPlaceholderEmail } from "@/lib/auth/identifiers";
import { getDb } from "@/lib/db/client";
import { issuedQuestion, seat, user } from "@/lib/db/schema";
import { seededRng } from "@/lib/engine/types";
import { answerQuestion, chooseIntro, endSession, startSession } from "@/lib/train/service";
import type { IssuedPayload, Screen } from "@/lib/train/types";
import { teacherScope } from "./scope";
import { localDay } from "./week";

// A demo class for local development, PR previews and the Phase 5 test (spec: "run a fake
// class of 25 seeded students through a simulated week"). Students train through the real
// training service with a simulated clock. Never available in production.

type Profile = { trainDays: number; accuracy: number };

// A realistic spread: most students keep up, some fall behind, a couple never start.
function profileFor(i: number, n: number, rng: () => number): Profile {
  const share = i / n;
  if (share < 0.6) return { trainDays: 5, accuracy: 0.85 + rng() * 0.1 };
  if (share < 0.8) return { trainDays: 3, accuracy: 0.75 + rng() * 0.1 };
  if (share < 0.92) return { trainDays: 1, accuracy: 0.6 + rng() * 0.15 };
  return { trainDays: 0, accuracy: 0 };
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
    const right = rng() < p.accuracy;
    const answer =
      q.mode === "choice"
        ? { chosenIndex: right ? q.correctIndex! : (q.correctIndex! + 1) % q.options!.length }
        : { typed: right ? q.expected! : "nada" };
    const responseMs = 2500 + Math.floor(rng() * 4000);
    screen = (
      await answerQuestion(
        userId,
        {
          questionId: screen.id,
          clientAnswerId: randomUUID(),
          ...answer,
          responseMs,
          activeMs: step(responseMs + 3000),
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

  const email = `demo-teacher-${randomUUID().slice(0, 8)}@example.com`;
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
    for (const day of trainOn) {
      await simulateSession(id, new Date(day.getTime() + i * 60_000), minutesPerSession, p, rng);
    }
  }
  return { classId: c.id, teacherEmail: email, teacherPassword: password, studentIds: ids };
}
