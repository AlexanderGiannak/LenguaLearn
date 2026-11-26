import { and, desc, eq, isNull } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { contentFlag, reviewLog, sense } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/handler";
import type { Reviewer } from "./access";

// The review tool's side of the nightly stats flags (the job is stats-job.ts).

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function openFlags(db: Pick<Db, "select">, senseId: number) {
  const rows = await db
    .select({ at: contentFlag.at, kind: contentFlag.kind, detail: contentFlag.detail })
    .from(contentFlag)
    .where(and(eq(contentFlag.senseId, senseId), isNull(contentFlag.resolvedAt)))
    .orderBy(desc(contentFlag.at));
  return rows.map((r) => ({ ...r, detail: r.detail as Record<string, number | string> }));
}

/** Closes a sense's open flags. The job then counts only answers given after this moment. */
export async function resolveFlags(
  tx: Tx | Db,
  reviewer: Reviewer,
  senseId: number,
  log: boolean,
): Promise<number> {
  const closed = await tx
    .update(contentFlag)
    .set({ resolvedAt: new Date(), resolvedBy: reviewer.id })
    .where(and(eq(contentFlag.senseId, senseId), isNull(contentFlag.resolvedAt)))
    .returning({ id: contentFlag.id });
  if (log && closed.length > 0) {
    await tx.insert(reviewLog).values({
      reviewerId: reviewer.id,
      senseId,
      action: "resolve_flags",
      reason: `${closed.length} flag(s)`,
    });
  }
  return closed.length;
}

/** Marks a sense's stats flags reviewed without changing it (the content was right). */
export async function markFlagsReviewed(db: Db, reviewer: Reviewer, senseId: number) {
  return db.transaction(async (tx) => {
    const [s] = await tx.select({ id: sense.id }).from(sense).where(eq(sense.id, senseId));
    if (!s) throw new HttpError(404, "not found");
    const resolved = await resolveFlags(tx, reviewer, senseId, true);
    if (resolved === 0) throw new HttpError(409, "no open flags");
    return { resolved };
  });
}
