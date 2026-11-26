import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { BadRequest, HttpError } from "@/lib/http/handler";
import type { ContentStatus } from "@/lib/content/constants";
import { CONTENT_TABLES, saveSense, type ContentTableName } from "@/lib/content/import";
import { senseSchema, type SenseInput } from "@/lib/content/import-schema";
import { locate } from "@/lib/content/locate";
import { applyStatusChanges, type StatusChange } from "@/lib/content/status-changes";
import type { getDb } from "@/lib/db/client";
import {
  audio,
  contentReport,
  example,
  hook,
  image,
  lemma,
  misuse,
  pseudoword,
  relation,
  reviewLog,
  sense,
  wordPart,
} from "@/lib/db/schema";
import { requireAdmin, type Reviewer } from "./access";
import { clearTrainingContentCache } from "@/lib/train/content-cache";
import { openReports, resolveReports } from "./reports";
import type { SenseEdit } from "./schema";

// The review tool (spec: Content pipeline, step 4; owner, 2026-11-25):
// - Reviewers see the queue, edit a sense, approve it or reject it with a reason.
// - An edit is saved with the import's rules (a revision, a new version, status draft) and
//   must pass the import's content checks. A person may then approve the draft directly.
// - Approving a sense approves the rows shown with it: its examples, hooks, relations,
//   misuses, images and example audio, and its lemma's headword, word parts and audio.
// - Only the admin publishes, moving every approved row to live.
// Every action is written to review_log.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const OPEN = ["draft", "ai_checked", "approved"] as const satisfies ContentStatus[];

/**
 * A live sense with something shown with it waiting for approval: an edited example, a
 * new recording after a reviewer flagged one, a changed headword. Students keep seeing the
 * live rows meanwhile (see waitingRows).
 */
const liveWithWaiting = sql`${sense.status} = 'live' and (
  exists (select 1 from ${example} x where x.sense_id = ${sense.id} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${hook} x where x.sense_id = ${sense.id} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${relation} x where x.sense_id = ${sense.id} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${misuse} x where x.sense_id = ${sense.id} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${image} x where x.sense_id = ${sense.id} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${audio} a join ${example} x on x.id = a.example_id
             where x.sense_id = ${sense.id} and x.status <> 'retired' and a.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${lemma} x where x.id = ${sense.lemmaId} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${wordPart} x where x.lemma_id = ${sense.lemmaId} and x.status in ('draft', 'ai_checked'))
  or exists (select 1 from ${audio} x where x.lemma_id = ${sense.lemmaId} and x.status in ('draft', 'ai_checked'))
)`;

/** Senses learners have reported, with reports no reviewer has answered yet. */
const reported = sql`exists (select 1 from ${contentReport} r
  where r.sense_id = ${sense.id} and r.resolved_at is null)`;

/** The senses in one queue tab. */
function inQueue(status: QueueStatus) {
  if (status === "changed") return liveWithWaiting;
  if (status === "reported") return and(ne(sense.status, "retired"), reported)!;
  return eq(sense.status, status);
}

export type QueueRow = {
  senseId: number;
  key: string;
  headword: string;
  gloss: string;
  level: number;
  status: ContentStatus;
  failures: number;
};

/** Senses waiting for a person: AI-passed first (quick approvals), then by frequency. */
export async function reviewQueue(
  db: Db,
  opts: {
    status: QueueStatus;
    /** Only senses with a failure from this check (see checkCounts). */
    check?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: QueueRow[]; total: number }> {
  const where = and(
    inQueue(opts.status),
    opts.check
      ? sql`${sense.checkNotes} @> ${JSON.stringify({ failures: [{ check: opts.check }] })}::jsonb`
      : undefined,
  );
  const rows = await db
    .select({
      senseId: sense.id,
      key: sense.key,
      headword: lemma.headword,
      gloss: sense.gloss,
      level: sense.level,
      status: sense.status,
      failures: sql<number>`coalesce(jsonb_array_length(${sense.checkNotes} -> 'failures'), 0)`,
    })
    .from(sense)
    .innerJoin(lemma, eq(lemma.id, sense.lemmaId))
    .where(where)
    .orderBy(asc(sense.frequencyRank), asc(sense.key))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(sense)
    .where(where)) as [{ total: number }];
  return { rows, total };
}

export type QueueStatus = "ai_checked" | "draft" | "approved" | "changed" | "reported";

/** How many senses in a queue have a failure from each check, for the queue's filter. */
export async function checkCounts(db: Db, status: QueueStatus) {
  const rows = await db.execute<{ check: string; n: number }>(sql`
    select f->>'check' as check, count(distinct ${sense.id})::int as n
    from ${sense}, jsonb_array_elements(coalesce(${sense.checkNotes} -> 'failures', '[]'::jsonb)) f
    where ${inQueue(status)}
    group by 1 order by 2 desc, 1`);
  return [...rows].map((r) => ({ check: String(r.check), n: Number(r.n) }));
}

/**
 * The sense after this one in the same queue, so a reviewer can go straight on. A sense with
 * open reports was reached from the Reported tab, so it goes on through that tab.
 */
export async function nextInQueue(
  db: Pick<Db, "select">,
  current: { status: ContentStatus; frequencyRank: number; key: string },
  from?: QueueStatus,
): Promise<number | null> {
  const queue: QueueStatus | null = from
    ? from
    : (OPEN as readonly ContentStatus[]).includes(current.status)
      ? (current.status as QueueStatus)
      : current.status === "live"
        ? "changed"
        : null;
  if (!queue) return null;
  const [row] = await db
    .select({ id: sense.id })
    .from(sense)
    .where(
      and(
        inQueue(queue),
        sql`(${sense.frequencyRank}, ${sense.key}) > (${current.frequencyRank}, ${current.key})`,
      ),
    )
    .orderBy(asc(sense.frequencyRank), asc(sense.key))
    .limit(1);
  return row?.id ?? null;
}

export async function queueCounts(db: Db): Promise<Record<QueueStatus, number>> {
  const rows = await db
    .select({ status: sense.status, n: sql<number>`count(*)::int` })
    .from(sense)
    .where(inArray(sense.status, OPEN))
    .groupBy(sense.status);
  const [changed] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sense)
    .where(liveWithWaiting)) as [{ n: number }];
  const [reportedCount] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sense)
    .where(inQueue("reported"))) as [{ n: number }];
  const counts = {
    draft: 0,
    ai_checked: 0,
    approved: 0,
    changed: changed.n,
    reported: reportedCount.n,
  };
  for (const r of rows) counts[r.status as (typeof OPEN)[number]] = r.n;
  return counts;
}

/** Everything the editor shows for one sense, without retired rows. */
export async function senseForReview(db: Pick<Db, "select">, senseId: number, viewerId: string) {
  const [s] = await db.select().from(sense).where(eq(sense.id, senseId));
  if (!s || s.status === "retired") throw new HttpError(404, "not found");
  const [l] = await db.select().from(lemma).where(eq(lemma.id, s.lemmaId));
  const notRetired = <T extends { status: ContentStatus }>(rows: T[]) =>
    rows.filter((r) => r.status !== "retired");
  const examples = notRetired(
    await db
      .select()
      .from(example)
      .where(eq(example.senseId, senseId))
      .orderBy(asc(example.position)),
  );
  const log = await db
    .select({
      at: reviewLog.at,
      action: reviewLog.action,
      reason: reviewLog.reason,
      reviewerId: reviewLog.reviewerId,
    })
    .from(reviewLog)
    .where(eq(reviewLog.senseId, senseId))
    .orderBy(desc(reviewLog.at))
    .limit(50);
  return {
    lemma: l!,
    wordParts: notRetired(
      await db
        .select()
        .from(wordPart)
        .where(eq(wordPart.lemmaId, l!.id))
        .orderBy(asc(wordPart.position)),
    ),
    sense: s,
    examples,
    hooks: notRetired(
      await db.select().from(hook).where(eq(hook.senseId, senseId)).orderBy(asc(hook.position)),
    ),
    relations: notRetired(
      await db
        .select()
        .from(relation)
        .where(eq(relation.senseId, senseId))
        .orderBy(asc(relation.position)),
    ),
    misuses: notRetired(
      await db
        .select()
        .from(misuse)
        .where(eq(misuse.senseId, senseId))
        .orderBy(asc(misuse.position)),
    ),
    images: notRetired(
      await db.select().from(image).where(eq(image.senseId, senseId)).orderBy(asc(image.position)),
    ),
    recordings: await recordingsFor(db, l!.id, examples),
    reports: await openReports(db, senseId),
    // Reviewers see who acted only as "you" or "another reviewer".
    log: log.map(({ reviewerId, ...r }) => ({ ...r, byYou: reviewerId === viewerId })),
  };
}

export type SenseForReview = Awaited<ReturnType<typeof senseForReview>>;

type Recording = { fileKey: string; status: ContentStatus; spokenText: string };

/** The headword's and each sentence's current recording, for the reviewer to listen to. */
async function recordingsFor(
  db: Pick<Db, "select">,
  lemmaId: number,
  examples: { id: number }[],
): Promise<{ headword: Recording | null; examples: (Recording | null)[] }> {
  const cols = {
    lemmaId: audio.lemmaId,
    exampleId: audio.exampleId,
    fileKey: audio.fileKey,
    status: audio.status,
    spokenText: audio.spokenText,
  };
  const ids = examples.map((e) => e.id);
  const rows = await db
    .select(cols)
    .from(audio)
    .where(
      and(
        ne(audio.status, "retired"),
        ids.length
          ? sql`(${audio.lemmaId} = ${lemmaId} or ${inArray(audio.exampleId, ids)})`
          : eq(audio.lemmaId, lemmaId),
      ),
    );
  const pick = ({ fileKey, status, spokenText }: (typeof rows)[number]) => ({
    fileKey,
    status,
    spokenText,
  });
  const headword = rows.find((r) => r.lemmaId === lemmaId);
  return {
    headword: headword ? pick(headword) : null,
    examples: examples.map((e) => {
      const r = rows.find((x) => x.exampleId === e.id);
      return r ? pick(r) : null;
    }),
  };
}

/** Builds the import's input for an edited sense, keeping what the editor does not touch. */
export function editToSenseInput(
  current: Pick<SenseForReview, "sense" | "examples" | "hooks" | "misuses" | "images"> & {
    exampleAudio: Map<number, { fileKey: string; voiceId: string; generatedAt: Date }>;
  },
  edit: SenseEdit,
): { input?: SenseInput; issues: string[] } {
  const issues: string[] = [];
  const unplaced = new Set<number>();
  const examples = edit.examples.map((e, i) => {
    const old = current.examples[i];
    const at = locate(e.text, e.surfaceForm);
    if ("error" in at) {
      issues.push(`examples.${i}.surfaceForm: ${at.error}`);
      unplaced.add(i);
    }
    const same =
      old !== undefined &&
      old.text === e.text &&
      old.surfaceForm === e.surfaceForm &&
      old.translation === e.translation &&
      JSON.stringify(old.distractors) === JSON.stringify(e.distractors);
    // Audio belongs to the sentence: a changed sentence loses it until it is regenerated.
    const a = old && old.text === e.text ? current.exampleAudio.get(old.id) : undefined;
    return {
      ...e,
      start: "error" in at ? 0 : at.start,
      end: "error" in at ? 1 : at.end,
      source: same ? old.source : ("human" as const),
      ...(old?.difficulty != null ? { difficulty: old.difficulty } : {}),
      ...(a
        ? {
            audio: {
              fileKey: a.fileKey,
              voiceId: a.voiceId,
              generatedAt: a.generatedAt.toISOString(),
            },
          }
        : {}),
    };
  });
  const hooks = edit.hooks.map((h, i) => {
    const old = current.hooks[i];
    const same = old !== undefined && old.kind === h.kind && old.text === h.text;
    return { ...h, source: same ? old.source : ("human" as const) };
  });
  const misuses = edit.misuses.map((m, i) => {
    const old = current.misuses[i];
    const same = old !== undefined && old.text === m.text && old.explanation === m.explanation;
    return { ...m, source: same ? old.source : ("human" as const) };
  });
  const s = current.sense;
  const parsed = senseSchema.safeParse({
    key: s.key,
    gloss: edit.gloss,
    definition: edit.definition,
    frequencyRank: s.frequencyRank,
    ...(s.difficulty != null ? { difficulty: s.difficulty } : {}),
    themes: edit.themes,
    register: edit.register,
    ...(edit.register === "regional" ? { region: edit.region } : {}),
    cognate: edit.cognate,
    ...(edit.cognate !== "none" ? { cognateEnglish: edit.cognateEnglish } : {}),
    concreteness: edit.concreteness,
    ...(edit.imageDescription ? { imageDescription: edit.imageDescription } : {}),
    ...(s.checkNotes ? { checkNotes: s.checkNotes } : {}),
    status: "draft",
    examples,
    hooks,
    relations: edit.relations,
    misuses,
    images: current.images.map((i) => ({
      fileKey: i.fileKey,
      alt: i.alt,
      source: i.source,
      license: i.license,
      attribution: i.attribution,
    })),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // The offsets come from locate(); for a word it could not place, its message above
      // is the useful one.
      const [field, index] = issue.path;
      if (field === "examples" && unplaced.has(Number(index))) {
        const last = issue.path.at(-1);
        if (last === "start" || last === "end" || last === "surfaceForm") continue;
      }
      issues.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }
  if (issues.length > 0 || !parsed.success) return { issues: [...new Set(issues)] };
  return { input: parsed.data, issues: [] };
}

async function lockSense(tx: Tx, senseId: number) {
  const [s] = await tx.select().from(sense).where(eq(sense.id, senseId)).for("update");
  if (!s || s.status === "retired") throw new HttpError(404, "not found");
  return s;
}

/** Saves an edit. Changed rows become drafts; the reviewer may then approve them. */
export async function editSense(db: Db, reviewer: Reviewer, senseId: number, edit: SenseEdit) {
  return db.transaction(async (tx) => {
    const s = await lockSense(tx, senseId);
    if (s.updatedAt.getTime() !== new Date(edit.loadedAt).getTime()) {
      throw new HttpError(409, "someone changed this sense since you opened it; reload it");
    }
    const current = await senseForReview(tx, senseId, reviewer.id);
    const exampleIds = current.examples.map((e) => e.id);
    const audioRows = exampleIds.length
      ? await tx
          .select()
          .from(audio)
          .where(and(inArray(audio.exampleId, exampleIds), ne(audio.status, "retired")))
      : [];
    const exampleAudio = new Map(audioRows.map((a) => [a.exampleId!, a]));
    const { input, issues } = editToSenseInput({ ...current, exampleAudio }, edit);
    if (!input) throw new BadRequest(issues.map((message) => ({ message })));

    const rows = await saveSense(tx, s.lemmaId, input);
    const changed = rows.some(
      (r) => r.action === "updated" || r.action === "created" || r.action === "retired",
    );
    if (changed) {
      await tx.insert(reviewLog).values({ reviewerId: reviewer.id, senseId, action: "edit" });
    }
    return { changed };
  });
}

/**
 * The rows of a sense that wait for approval (draft or ai_checked): the sense itself and
 * the rows shown with it. An edit to one example of a live sense leaves only that example
 * waiting, so approval covers children too, not just the sense.
 */
export async function waitingRows(
  db: Pick<Db, "select"> | Tx,
  s: { id: number; lemmaId: number; status: ContentStatus },
): Promise<StatusChange[]> {
  const waiting = ["draft", "ai_checked"] as const;
  const changes: StatusChange[] = [];
  if ((waiting as readonly ContentStatus[]).includes(s.status))
    changes.push({ table: "sense", id: s.id, to: "approved" });
  const add = async (name: ContentTableName, where: ReturnType<typeof eq>) => {
    const table = CONTENT_TABLES[name] as typeof lemma;
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(where, inArray(table.status, waiting)));
    for (const r of rows) changes.push({ table: name, id: r.id, to: "approved" });
  };
  await add("lemma", eq(lemma.id, s.lemmaId));
  await add("word_part", eq(wordPart.lemmaId, s.lemmaId));
  await add("audio", eq(audio.lemmaId, s.lemmaId));
  for (const [name, table] of [
    ["example", example],
    ["hook", hook],
    ["relation", relation],
    ["misuse", misuse],
    ["image", image],
  ] as const) {
    await add(name, eq(table.senseId, s.id));
  }
  const exampleIds = (
    await db
      .select({ id: example.id })
      .from(example)
      .where(and(eq(example.senseId, s.id), ne(example.status, "retired")))
  ).map((r) => r.id);
  if (exampleIds.length) await add("audio", inArray(audio.exampleId, exampleIds));
  return changes;
}

/** Approves everything in a sense that waits for approval (see waitingRows). */
export async function approveSense(db: Db, reviewer: Reviewer, senseId: number) {
  const result = await db.transaction(async (tx) => {
    const s = await lockSense(tx, senseId);
    const changes = await waitingRows(tx, s);
    if (changes.length === 0) throw new HttpError(409, `nothing here waits for approval`);
    await applyStatusChanges(tx, changes, "human-review");
    await tx.insert(reviewLog).values({ reviewerId: reviewer.id, senseId, action: "approve" });
    // The sense has been reviewed, so its open reports are answered and it is taught again.
    await resolveReports(tx, reviewer, senseId, false);
    return { approved: changes.length };
  });
  // After commit: a paused sense is introduced again straight away.
  clearTrainingContentCache();
  return result;
}

/** Sends a sense back to draft with the reviewer's reason. */
export async function rejectSense(db: Db, reviewer: Reviewer, senseId: number, reason: string) {
  return db.transaction(async (tx) => {
    const s = await lockSense(tx, senseId);
    if (s.status === "live") {
      throw new HttpError(409, "a live sense is changed by editing it or retired by the admin");
    }
    if (s.status !== "draft") {
      await applyStatusChanges(tx, [{ table: "sense", id: senseId, to: "draft" }]);
    }
    await tx
      .insert(reviewLog)
      .values({ reviewerId: reviewer.id, senseId, action: "reject", reason });
    return { status: "draft" as const };
  });
}

/**
 * A reviewer heard a wrong pronunciation: the recording is retired (students fall back to
 * the browser's voice) and the next `content:audio` run makes a new one, which comes back
 * here as a draft to approve.
 */
export async function flagAudio(
  db: Db,
  reviewer: Reviewer,
  senseId: number,
  target: { owner: "lemma" } | { owner: "example"; exampleId: number },
  reason: string,
) {
  return db.transaction(async (tx) => {
    const s = await lockSense(tx, senseId);
    const owner =
      target.owner === "lemma"
        ? eq(audio.lemmaId, s.lemmaId)
        : and(
            eq(audio.exampleId, target.exampleId),
            sql`exists (select 1 from ${example} x where x.id = ${audio.exampleId} and x.sense_id = ${senseId})`,
          );
    const [row] = await tx
      .select({ id: audio.id })
      .from(audio)
      .where(and(owner, ne(audio.status, "retired")));
    if (!row) throw new HttpError(404, "no recording to flag");
    await applyStatusChanges(tx, [{ table: "audio", id: row.id, to: "retired" }]);
    await tx
      .insert(reviewLog)
      .values({ reviewerId: reviewer.id, senseId, action: "flag_audio", reason });
    return { retired: row.id };
  });
}

/** Admin only: every approved row goes live. */
export async function publishApproved(db: Db, reviewer: Reviewer) {
  requireAdmin(reviewer);
  return db.transaction(async (tx) => {
    const changes: StatusChange[] = [];
    for (const [name, t] of Object.entries(CONTENT_TABLES) as [ContentTableName, unknown][]) {
      const table = t as typeof lemma;
      const rows = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.status, "approved"));
      for (const r of rows) changes.push({ table: name, id: r.id, to: "live" });
    }
    if (changes.length === 0) return { published: 0, senses: 0, pseudowords: 0 };
    await applyStatusChanges(tx, changes);
    const senseIds = changes.filter((c) => c.table === "sense").map((c) => c.id);
    const pseudowordIds = changes.filter((c) => c.table === "pseudoword").map((c) => c.id);
    const entries = [
      ...senseIds.map((senseId) => ({ senseId })),
      ...pseudowordIds.map((pseudowordId) => ({ pseudowordId })),
    ].map((t) => ({ ...t, reviewerId: reviewer.id, action: "publish" as const }));
    if (entries.length) await tx.insert(reviewLog).values(entries);
    return {
      published: changes.length,
      senses: senseIds.length,
      pseudowords: pseudowordIds.length,
    };
  });
}

export async function pseudowordQueue(db: Db) {
  return db
    .select({ id: pseudoword.id, text: pseudoword.text, status: pseudoword.status })
    .from(pseudoword)
    .where(inArray(pseudoword.status, ["draft", "ai_checked", "approved"]))
    .orderBy(asc(pseudoword.text));
}

/**
 * Approves pseudowords (a person checked each is not a real word) or rejects them, which
 * retires them: a rejected pseudoword is not fixed, it is dropped.
 */
export async function decidePseudowords(
  db: Db,
  reviewer: Reviewer,
  ids: number[],
  action: "approve" | "reject",
) {
  return db.transaction(async (tx) => {
    const to = action === "approve" ? "approved" : "retired";
    await applyStatusChanges(
      tx,
      ids.map((id) => ({ table: "pseudoword" as const, id, to })),
      "human-review",
    );
    await tx
      .insert(reviewLog)
      .values(ids.map((pseudowordId) => ({ reviewerId: reviewer.id, pseudowordId, action })));
    return { [action === "approve" ? "approved" : "rejected"]: ids.length };
  });
}
