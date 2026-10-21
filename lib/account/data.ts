import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  adminActionLog,
  answerEvent,
  card,
  classroom,
  learnerProfile,
  seat,
  senseProgress,
  studySession,
  user,
} from "@/lib/db/schema";
import { teacherScope } from "@/lib/teacher/scope";

// Export and deletion (spec: Deletion and export). Deleting a user row cascades to every
// table that holds their data: sessions, cards, progress, answers and study sessions.

/** Everything the app holds about one user, as JSON they can download. */
export async function exportUserData(userId: string) {
  const db = getDb();
  const [u] = await db
    .select({
      handleOrUsername: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  const [classes, profile, cards, progress, sessions, answers] = await Promise.all([
    db
      .select({ className: classroom.name, seatNumber: seat.seatNumber, joinedAt: seat.joinedAt })
      .from(seat)
      .innerJoin(classroom, eq(seat.classroomId, classroom.id))
      .where(eq(seat.studentId, userId)),
    db.select().from(learnerProfile).where(eq(learnerProfile.userId, userId)),
    db.select().from(card).where(eq(card.userId, userId)),
    db.select().from(senseProgress).where(eq(senseProgress.userId, userId)),
    db
      .select({
        startedAt: studySession.startedAt,
        endedAt: studySession.endedAt,
        activeMs: studySession.activeMs,
      })
      .from(studySession)
      .where(eq(studySession.userId, userId)),
    db.select().from(answerEvent).where(eq(answerEvent.userId, userId)),
  ]);
  const placeholder = u?.email.endsWith(".invalid");
  return {
    exportedAt: new Date().toISOString(),
    account: u ? { ...u, email: placeholder ? null : u.email } : null,
    classes,
    profile: profile[0] ?? null,
    cards,
    wordProgress: progress,
    sessions,
    answers: answers.map(({ userId: _userId, ...rest }) => rest),
  };
}

/** Deletes a user and all their data. A teacher's classes go first (seats, student links). */
export async function deleteAccount(userId: string): Promise<void> {
  const db = getDb();
  const [u] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (!u) return;
  if (u.role === "teacher") {
    const scope = teacherScope(userId);
    for (const c of await scope.listClasses()) await scope.deleteClass(c.id);
  }
  await db.delete(user).where(eq(user.id, userId));
}

// --- District requests, run by the admin (spec: one student, one class, or all data) ---

export async function adminDeleteStudent(studentId: string): Promise<void> {
  await getDb().delete(user).where(eq(user.id, studentId));
  await logAdminAction("delete_student", studentId);
}

export async function adminDeleteClass(classId: string, withStudents: boolean): Promise<void> {
  const db = getDb();
  const [c] = await db.select().from(classroom).where(eq(classroom.id, classId));
  if (!c) return;
  const students = await db
    .select({ id: seat.studentId })
    .from(seat)
    .where(eq(seat.classroomId, classId));
  await teacherScope(c.teacherId).deleteClass(classId);
  const ids = students.map((s) => s.id).filter((id): id is string => id !== null);
  if (withStudents && ids.length > 0) {
    // Only students with no seat in any other class: the others still belong to a class.
    const stillSeated = await db
      .select({ id: seat.studentId })
      .from(seat)
      .where(inArray(seat.studentId, ids));
    const keep = new Set(stillSeated.map((s) => s.id));
    const remove = ids.filter((id) => !keep.has(id));
    if (remove.length > 0) await db.delete(user).where(inArray(user.id, remove));
  }
  await logAdminAction(withStudents ? "delete_class_and_students" : "delete_class", classId);
}

async function logAdminAction(action: string, target: string, detail?: string) {
  await getDb().insert(adminActionLog).values({ action, target, detail });
}
