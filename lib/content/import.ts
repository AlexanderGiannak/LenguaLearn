import { and, eq, gte, inArray, ne, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { getDb } from "@/lib/db/client";
import {
  audio,
  contentRevision,
  example,
  hook,
  image,
  lemma,
  relation,
  sense,
  wordList,
  wordListItem,
  wordPart,
} from "@/lib/db/schema";
import type { ContentStatus, ImportStatus } from "./constants";
import type { ImportPayload, LemmaInput, SenseInput } from "./import-schema";

// Loads a validated import payload in one transaction.
//
// Rules:
// - Lemmas, senses and lists are matched by their stable key; their children by position
//   under the parent. Matched rows keep their ID, so student history is never orphaned.
// - A new row gets the import's status (draft or ai_checked) at version 1.
// - A row whose content changed is updated, its old version is saved in content_revision,
//   its version goes up by one, and it goes back to the import's status, even if it was
//   live: changed content has to be reviewed again.
// - An unchanged row keeps its version. It stays approved or live if it was; otherwise it
//   takes the import's status.
// - Children missing from the import (an example that was dropped) are retired, never
//   deleted. Senses missing from a lemma are left alone; retire those explicitly.

export const CONTENT_TABLES = {
  lemma,
  sense,
  example,
  word_part: wordPart,
  relation,
  hook,
  image,
  audio,
  word_list: wordList,
} as const;
export type ContentTableName = keyof typeof CONTENT_TABLES;
export const CONTENT_TABLE_NAMES = Object.keys(CONTENT_TABLES) as [
  ContentTableName,
  ...ContentTableName[],
];

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Action = "created" | "updated" | "unchanged" | "retired";

export type ImportRow = {
  table: ContentTableName;
  id: number;
  key?: string;
  action: Action;
  status: ContentStatus;
};

export type ImportReport = {
  counts: Record<Action, number>;
  rows: ImportRow[];
};

/** A problem that needs the database to detect, such as a list naming an unknown sense. */
export class ImportError extends Error {
  constructor(readonly problems: string[]) {
    super(`import rejected: ${problems.join("; ")}`);
  }
}

type Values = Record<string, unknown>;
type StoredRow = Values & { id: number; status: ContentStatus; version: number };

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return (a ?? null) === (b ?? null);
}

class Importer {
  readonly rows: ImportRow[] = [];

  constructor(private readonly tx: Tx) {}

  async upsert(
    name: ContentTableName,
    match: SQL,
    values: Values,
    status: ImportStatus,
    opts: { key?: string; extraChanged?: boolean; extraSnapshot?: Values } = {},
  ): Promise<number> {
    // Drizzle's types cannot follow a table chosen at runtime, so the generic paths below
    // work on plain rows. The values come from the Zod-validated payload.
    const table = CONTENT_TABLES[name] as typeof lemma;
    const [existing] = (await this.tx
      .select()
      .from(table)
      .where(match)
      .for("update")) as unknown as StoredRow[];

    if (!existing) {
      const [created] = await this.tx
        .insert(table)
        .values({ ...values, status } as typeof lemma.$inferInsert)
        .returning({ id: table.id });
      this.record(name, created!.id, "created", status, opts.key);
      return created!.id;
    }

    const changed =
      opts.extraChanged || Object.entries(values).some(([k, v]) => !sameValue(existing[k], v));

    if (changed) {
      await this.tx.insert(contentRevision).values({
        tableName: name,
        rowId: existing.id,
        version: existing.version,
        snapshot: { ...existing, ...opts.extraSnapshot },
      });
      await this.tx
        .update(table)
        .set({
          ...values,
          status,
          version: existing.version + 1,
          updatedAt: new Date(),
        } as Partial<typeof lemma.$inferInsert>)
        .where(eq(table.id, existing.id));
      this.record(name, existing.id, "updated", status, opts.key);
      return existing.id;
    }

    const keepsStatus = existing.status === "approved" || existing.status === "live";
    const finalStatus = keepsStatus ? existing.status : status;
    if (finalStatus !== existing.status) {
      await this.tx
        .update(table)
        .set({ status: finalStatus, updatedAt: new Date() })
        .where(eq(table.id, existing.id));
    }
    this.record(name, existing.id, "unchanged", finalStatus, opts.key);
    return existing.id;
  }

  /** Upserts children at positions 0..n-1 and retires any at position n or later. */
  async replaceChildren(
    name: ContentTableName,
    parentColumn: PgColumn,
    parentField: string,
    parentId: number,
    items: Values[],
    status: ImportStatus,
  ): Promise<number[]> {
    const table = CONTENT_TABLES[name] as unknown as typeof example;
    const ids: number[] = [];
    for (const [position, item] of items.entries()) {
      const match = and(eq(parentColumn, parentId), eq(table.position, position))!;
      ids.push(
        await this.upsert(name, match, { ...item, [parentField]: parentId, position }, status),
      );
    }
    await this.retireWhere(
      name,
      and(eq(parentColumn, parentId), gte(table.position, items.length))!,
    );
    return ids;
  }

  async retireWhere(name: ContentTableName, match: SQL): Promise<void> {
    const table = CONTENT_TABLES[name] as typeof lemma;
    const retired = await this.tx
      .update(table)
      .set({ status: "retired", updatedAt: new Date() })
      .where(and(match, ne(table.status, "retired")))
      .returning({ id: table.id });
    for (const { id } of retired) this.record(name, id, "retired", "retired");
  }

  private record(
    table: ContentTableName,
    id: number,
    action: Action,
    status: ContentStatus,
    key?: string,
  ) {
    this.rows.push({ table, id, action, status, ...(key ? { key } : {}) });
  }

  async importLemma(l: LemmaInput): Promise<void> {
    const lemmaId = await this.upsert(
      "lemma",
      eq(lemma.key, l.key),
      {
        key: l.key,
        headword: l.headword,
        partOfSpeech: l.partOfSpeech,
        gender: l.gender ?? null,
        articleOverride: l.articleOverride ?? null,
        plural: l.plural ?? null,
        feminine: l.feminine ?? null,
        formsNote: l.formsNote ?? null,
        frequencyRank: l.frequencyRank,
      },
      l.status,
      { key: l.key },
    );

    await this.importAudio(audio.lemmaId, "lemmaId", lemmaId, l.audio, l.status);
    await this.replaceChildren(
      "word_part",
      wordPart.lemmaId,
      "lemmaId",
      lemmaId,
      l.wordParts.map((w) => ({ kind: w.kind, text: w.text, meaning: w.meaning })),
      l.status,
    );
    for (const s of l.senses) await this.importSense(lemmaId, s);
  }

  async importSense(lemmaId: number, s: SenseInput): Promise<void> {
    const senseId = await this.upsert(
      "sense",
      eq(sense.key, s.key),
      {
        lemmaId,
        key: s.key,
        gloss: s.gloss,
        definition: s.definition,
        frequencyRank: s.frequencyRank,
        difficulty: s.difficulty ?? null,
        themes: s.themes,
        register: s.register,
        region: s.region ?? null,
        cognate: s.cognate,
        cognateEnglish: s.cognateEnglish ?? null,
        concreteness: s.concreteness,
      },
      s.status,
      { key: s.key },
    );

    const exampleIds = await this.replaceChildren(
      "example",
      example.senseId,
      "senseId",
      senseId,
      s.examples.map((e) => ({
        text: e.text,
        surfaceForm: e.surfaceForm,
        startOffset: e.start,
        endOffset: e.end,
        translation: e.translation,
        distractors: e.distractors,
        source: e.source,
        difficulty: e.difficulty ?? null,
      })),
      s.status,
    );
    for (const [i, exampleId] of exampleIds.entries()) {
      await this.importAudio(
        audio.exampleId,
        "exampleId",
        exampleId,
        s.examples[i]!.audio,
        s.status,
      );
    }

    await this.replaceChildren(
      "hook",
      hook.senseId,
      "senseId",
      senseId,
      s.hooks.map((h) => ({ kind: h.kind, text: h.text, source: h.source })),
      s.status,
    );
    await this.replaceChildren(
      "relation",
      relation.senseId,
      "senseId",
      senseId,
      s.relations.map((r) => ({ type: r.type, text: r.text, targetKey: r.targetKey ?? null })),
      s.status,
    );
    await this.replaceChildren(
      "image",
      image.senseId,
      "senseId",
      senseId,
      s.images.map((i) => ({
        fileKey: i.fileKey,
        alt: i.alt,
        source: i.source,
        license: i.license,
        attribution: i.attribution,
      })),
      s.status,
    );
  }

  async importAudio(
    ownerColumn: PgColumn,
    ownerField: "lemmaId" | "exampleId",
    ownerId: number,
    a: LemmaInput["audio"],
    status: ImportStatus,
  ): Promise<void> {
    if (!a) {
      await this.retireWhere("audio", eq(ownerColumn, ownerId));
      return;
    }
    await this.upsert(
      "audio",
      eq(ownerColumn, ownerId),
      {
        [ownerField]: ownerId,
        fileKey: a.fileKey,
        voiceId: a.voiceId,
        generatedAt: new Date(a.generatedAt),
      },
      status,
    );
  }

  async importList(list: ImportPayload["lists"][number]): Promise<string[]> {
    const found = list.senseKeys.length
      ? await this.tx
          .select({ id: sense.id, key: sense.key })
          .from(sense)
          .where(inArray(sense.key, list.senseKeys))
      : [];
    const idByKey = new Map(found.map((r) => [r.key, r.id]));
    const missing = list.senseKeys.filter((k) => !idByKey.has(k));
    if (missing.length > 0) {
      return [`list "${list.key}" names unknown senses: ${missing.join(", ")}`];
    }
    const senseIds = list.senseKeys.map((k) => idByKey.get(k)!);

    const [existing] = await this.tx
      .select({ id: wordList.id })
      .from(wordList)
      .where(eq(wordList.key, list.key));
    const oldIds = existing
      ? (
          await this.tx
            .select({ senseId: wordListItem.senseId })
            .from(wordListItem)
            .where(eq(wordListItem.listId, existing.id))
            .orderBy(wordListItem.position)
        ).map((r) => r.senseId)
      : [];
    const itemsChanged = !sameValue(oldIds, senseIds);

    const listId = await this.upsert(
      "word_list",
      eq(wordList.key, list.key),
      { key: list.key, name: list.name, description: list.description ?? null },
      list.status,
      { key: list.key, extraChanged: itemsChanged, extraSnapshot: { senseIds: oldIds } },
    );
    if (itemsChanged) {
      await this.tx.delete(wordListItem).where(eq(wordListItem.listId, listId));
      if (senseIds.length > 0) {
        await this.tx
          .insert(wordListItem)
          .values(senseIds.map((senseId, position) => ({ listId, senseId, position })));
      }
    }
    return [];
  }
}

export async function importContent(db: Db, payload: ImportPayload): Promise<ImportReport> {
  return db.transaction(async (tx) => {
    const importer = new Importer(tx);
    for (const l of payload.lemmas) await importer.importLemma(l);

    const problems: string[] = [];
    for (const list of payload.lists) problems.push(...(await importer.importList(list)));
    // Throwing rolls back the whole transaction, so a rejected import writes nothing.
    if (problems.length > 0) throw new ImportError(problems);

    const counts: Record<Action, number> = { created: 0, updated: 0, unchanged: 0, retired: 0 };
    for (const row of importer.rows) counts[row.action] += 1;
    return { counts, rows: importer.rows };
  });
}
