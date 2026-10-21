import { eq, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import type { ContentStatus } from "./constants";
import { CONTENT_TABLES, type ContentTableName } from "./import";
import { canTransition } from "./status";

export type StatusChange = { table: ContentTableName; id: number; to: ContentStatus };
export type AppliedChange = {
  table: ContentTableName;
  id: number;
  from: ContentStatus;
  to: ContentStatus;
};

export class StatusChangeError extends Error {
  constructor(readonly problems: string[]) {
    super(`status change rejected: ${problems.join("; ")}`);
  }
}

/**
 * Applies a batch of status changes in one transaction. Every change must be an allowed
 * step (see status.ts); if any is not, nothing is applied.
 */
export async function applyStatusChanges(
  db: ReturnType<typeof getDb>,
  changes: StatusChange[],
): Promise<AppliedChange[]> {
  return db.transaction(async (tx) => {
    const problems: string[] = [];
    const applied: AppliedChange[] = [];

    const byTable = new Map<ContentTableName, StatusChange[]>();
    for (const c of changes) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);

    for (const [name, group] of byTable) {
      // Same runtime-chosen-table cast as in import.ts.
      const table = CONTENT_TABLES[name] as (typeof CONTENT_TABLES)["lemma"];
      const ids = group.map((c) => c.id);
      const current = await tx
        .select({ id: table.id, status: table.status })
        .from(table)
        .where(inArray(table.id, ids))
        .for("update");
      const statusById = new Map(current.map((r) => [r.id, r.status]));

      for (const c of group) {
        const from = statusById.get(c.id);
        if (from === undefined) {
          problems.push(`${name} ${c.id}: not found`);
        } else if (!canTransition(from, c.to)) {
          problems.push(`${name} ${c.id}: ${from} -> ${c.to} is not allowed`);
        } else {
          applied.push({ table: name, id: c.id, from, to: c.to });
          // Later changes in the same batch see this one, e.g. ai_checked -> approved -> live.
          statusById.set(c.id, c.to);
        }
      }
    }
    if (problems.length > 0) throw new StatusChangeError(problems);

    const now = new Date();
    for (const c of applied) {
      const table = CONTENT_TABLES[c.table] as (typeof CONTENT_TABLES)["lemma"];
      await tx.update(table).set({ status: c.to, updatedAt: now }).where(eq(table.id, c.id));
    }
    return applied;
  });
}
