import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/lib/db/client";
import { contentReport, issuedQuestion, reviewLog, sense } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/handler";
import type { IssuedPayload } from "@/lib/train/types";
import type { Reviewer } from "./access";
import { clearTrainingContentCache } from "@/lib/train/content-cache";
import {
  REPORT_REASONS,
  REPORT_TEXT_MAX,
  reportTextAllowed,
  scrubPersonalDetails,
} from "./report-reasons";

// "Report a problem" (spec: Content pipeline, step 5). A learner reports the question they
// were shown; the server finds its sense from the question it issued them, so the browser
// never learns a sense ID (which would lead to the word page and the answer). A sense with
// enough open reports from different learners stops being introduced to new learners until
// a reviewer looks at it. Reviewers see the reason and text, never who sent it.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const REPORT_CONFIG = {
  /** Open reports from different learners that pause a sense for new learners. */
  pauseAt: 3,
  /** Reports one learner may send in a day: enough for real problems, not for spam. */
  perDay: 20,
  textMax: REPORT_TEXT_MAX,
} as const;

export const reportSchema = z.strictObject({
  questionId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  text: z
    .string()
    .max(REPORT_CONFIG.textMax)
    .transform((s) => s.normalize("NFC").trim())
    .optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

/**
 * Saves a learner's report. Reporting the same sense again while the first is still open
 * updates it, so one learner never counts twice toward a pause.
 */
export async function submitReport(
  db: Db,
  reporter: { id: string; role: string },
  input: ReportInput,
  now = new Date(),
) {
  const userId = reporter.id;
  if (input.text?.trim() && !reportTextAllowed(reporter.role)) {
    throw new HttpError(400, "Only independent learners can add text. Choose a reason.");
  }
  const result = await db.transaction(async (tx) => {
    const [issued] = await tx
      .select({ payload: issuedQuestion.payload })
      .from(issuedQuestion)
      .where(and(eq(issuedQuestion.id, input.questionId), eq(issuedQuestion.userId, userId)));
    if (!issued) throw new HttpError(404, "question not found");
    const payload = issued.payload as IssuedPayload;

    const [{ n }] = (await tx
      .select({ n: count() })
      .from(contentReport)
      .where(
        and(
          eq(contentReport.reporterId, userId),
          gte(contentReport.at, new Date(now.getTime() - 24 * 3_600_000)),
        ),
      )) as [{ n: number }];
    if (n >= REPORT_CONFIG.perDay) {
      throw new HttpError(429, "Thanks for all your reports today. Try again tomorrow.");
    }

    const values = {
      senseId: payload.senseId,
      reporterId: userId,
      reason: input.reason,
      text:
        scrubPersonalDetails(input.text?.normalize("NFC").trim() ?? "").slice(
          0,
          REPORT_CONFIG.textMax,
        ) || null,
      questionType: payload.question?.type ?? payload.stage,
      at: now,
    };
    await tx
      .insert(contentReport)
      .values(values)
      .onConflictDoUpdate({
        target: [contentReport.senseId, contentReport.reporterId],
        targetWhere: sql`${contentReport.resolvedAt} is null`,
        set: {
          reason: values.reason,
          text: values.text,
          questionType: values.questionType,
          at: now,
        },
      });
    const [{ reporters }] = (await tx
      .select({ reporters: sql<number>`count(distinct ${contentReport.reporterId})::int` })
      .from(contentReport)
      .where(
        and(eq(contentReport.senseId, payload.senseId), isNull(contentReport.resolvedAt)),
      )) as [{ reporters: number }];
    return { paused: reporters >= REPORT_CONFIG.pauseAt };
  });
  // Pause at once rather than when the cached content next expires.
  if (result.paused) clearTrainingContentCache();
  return { ok: true as const };
}

/** Senses with enough open reports to stop introducing them (see REPORT_CONFIG.pauseAt). */
export async function pausedSenseIds(db: Pick<Db, "select">): Promise<Set<number>> {
  const rows = await db
    .select({ senseId: contentReport.senseId })
    .from(contentReport)
    .where(isNull(contentReport.resolvedAt))
    .groupBy(contentReport.senseId)
    .having(sql`count(distinct ${contentReport.reporterId}) >= ${REPORT_CONFIG.pauseAt}`);
  return new Set(rows.map((r) => r.senseId));
}

/** A sense's open reports for the review tool, without who sent them. */
export async function openReports(db: Pick<Db, "select">, senseId: number) {
  return db
    .select({
      at: contentReport.at,
      reason: contentReport.reason,
      text: contentReport.text,
      questionType: contentReport.questionType,
    })
    .from(contentReport)
    .where(and(eq(contentReport.senseId, senseId), isNull(contentReport.resolvedAt)))
    .orderBy(desc(contentReport.at));
}

/**
 * Closes a sense's open reports: a reviewer has looked at it, so it is introduced again. The
 * caller drops the training cache once its transaction commits (before that, a request
 * could reload the still-open reports into the cache).
 */
export async function resolveReports(
  tx: Tx | Db,
  reviewer: Reviewer,
  senseId: number,
  log: boolean,
): Promise<number> {
  const closed = await tx
    .update(contentReport)
    .set({ resolvedAt: new Date(), resolvedBy: reviewer.id })
    .where(and(eq(contentReport.senseId, senseId), isNull(contentReport.resolvedAt)))
    .returning({ id: contentReport.id });
  if (log && closed.length > 0) {
    await tx.insert(reviewLog).values({
      reviewerId: reviewer.id,
      senseId,
      action: "resolve_reports",
      reason: `${closed.length} report(s)`,
    });
  }
  return closed.length;
}

/** Marks a sense's reports reviewed without changing it (the content was right). */
export async function markReportsReviewed(db: Db, reviewer: Reviewer, senseId: number) {
  const result = await db.transaction(async (tx) => {
    const [s] = await tx.select({ id: sense.id }).from(sense).where(eq(sense.id, senseId));
    if (!s) throw new HttpError(404, "not found");
    const resolved = await resolveReports(tx, reviewer, senseId, true);
    if (resolved === 0) throw new HttpError(409, "no open reports");
    return { resolved };
  });
  clearTrainingContentCache();
  return result;
}
