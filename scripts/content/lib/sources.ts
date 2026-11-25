// The openly licensed sources the content scripts read (see content/SOURCES.md), downloaded
// once and cached in ~/.cache/lengualearn, outside the repo, because iCloud syncs the repo.
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { LemmaIndex, type WiktionaryEntry } from "./word-list.ts";

export const SOURCES = {
  frequency: {
    file: "es_50k.txt",
    url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt",
  },
  wiktionary: {
    file: "kaikki-es.jsonl.gz",
    url: "https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl.gz",
  },
};

const cacheDir = join(homedir(), ".cache", "lengualearn");

export async function cached(source: { file: string; url: string }): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const path = join(cacheDir, source.file);
  if (!existsSync(path)) {
    console.log(`Downloading ${source.url}`);
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`${source.url} returned ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

/** Reads every Spanish Wiktionary entry into a LemmaIndex (about a minute). */
export async function loadLemmaIndex(): Promise<{ index: LemmaIndex; entries: number }> {
  const index = new LemmaIndex();
  const lines = createInterface({
    input: createReadStream(await cached(SOURCES.wiktionary)).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  let entries = 0;
  for await (const line of lines) {
    if (!line) continue;
    index.add(JSON.parse(line) as WiktionaryEntry);
    entries++;
  }
  return { index, entries };
}
