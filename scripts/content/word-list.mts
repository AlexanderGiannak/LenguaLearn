// Content pipeline step 1: the frequency-ranked candidate list.
//
//   npm run content:word-list               # writes content/candidates.csv and dropped.csv
//   npm run content:word-list -- --limit 12000
//
// Sources and their licenses are in content/SOURCES.md. Both downloads (about 100 MB) are
// cached in ~/.cache/lengualearn, outside the repo, because iCloud syncs the repo folder.
// This script reads no database and calls no AI service.
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { LEVEL_BAND_SIZE } from "../../lib/content/constants.ts";
import {
  LemmaIndex,
  parseFrequencyList,
  rankLemmas,
  toCsv,
  type WiktionaryEntry,
} from "./lib/word-list.ts";

const SOURCES = {
  frequency: {
    file: "es_50k.txt",
    url: "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt",
  },
  wiktionary: {
    file: "kaikki-es.jsonl.gz",
    url: "https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl.gz",
  },
};

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 12_000;
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");

const cacheDir = join(homedir(), ".cache", "lengualearn");
const outDir = new URL("../../content/", import.meta.url);
mkdirSync(cacheDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

async function cached(source: { file: string; url: string }): Promise<string> {
  const path = join(cacheDir, source.file);
  if (!existsSync(path)) {
    console.log(`Downloading ${source.url}`);
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`${source.url} returned ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

const forms = parseFrequencyList(await readFile(await cached(SOURCES.frequency), "utf8"));
console.log(`${forms.length} word forms`);

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
console.log(`${entries} Wiktionary entries, ${index.headwords.size} headwords`);

const { candidates, dropped, unmatched } = rankLemmas(forms, index, {
  limit,
  levelBandSize: LEVEL_BAND_SIZE,
});

writeFileSync(
  new URL("candidates.csv", outDir),
  toCsv(
    ["rank", "lemma", "pos", "level", "count", "themes", "notes"],
    candidates.map((c) => [c.rank, c.lemma, c.pos.join("|"), c.level, c.count, "", c.notes]),
  ),
);
writeFileSync(
  new URL("dropped.csv", outDir),
  toCsv(
    ["lemma", "count", "reason"],
    dropped.map((d) => [d.lemma, d.count, d.reason]),
  ),
);

console.log(`Wrote ${candidates.length} candidates and ${dropped.length} dropped words.`);
console.log(
  `Top 40: ${candidates
    .slice(0, 40)
    .map((c) => c.lemma)
    .join(", ")}`,
);
console.log(`Most common forms with no Wiktionary headword (not in the list):`);
console.log(
  unmatched
    .slice(0, 40)
    .map((u) => u.form)
    .join(", "),
);
