// Content pipeline step 1: the frequency-ranked candidate list.
//
//   npm run content:word-list               # writes content/candidates.csv and dropped.csv
//   npm run content:word-list -- --limit 12000
//
// Sources and their licenses are in content/SOURCES.md. Both downloads (about 100 MB) are
// cached in ~/.cache/lengualearn, outside the repo, because iCloud syncs the repo folder.
// This script reads no database and calls no AI service.
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { LEVEL_BAND_SIZE } from "../../lib/content/constants.ts";
import { cached, loadLemmaIndex, SOURCES } from "./lib/sources.ts";
import { parseFrequencyList, rankLemmas, toCsv } from "./lib/word-list.ts";

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : 12_000;
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");

const outDir = new URL("../../content/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const forms = parseFrequencyList(await readFile(await cached(SOURCES.frequency), "utf8"));
console.log(`${forms.length} word forms`);

const { index, entries } = await loadLemmaIndex();
console.log(`${entries} Wiktionary entries, ${index.headwords.size} headwords`);

// Function words the owner keeps as cards anyway (see the file's header).
const keep = new Set(
  (await readFile(new URL("kept-function-words.txt", outDir), "utf8"))
    .split("\n")
    .map((l) => l.trim().normalize("NFC"))
    .filter((l) => l && !l.startsWith("#")),
);
const { candidates, dropped, unmatched } = rankLemmas(forms, index, {
  limit,
  levelBandSize: LEVEL_BAND_SIZE,
  keep,
});
const missing = [...keep].filter((w) => !candidates.some((c) => c.lemma === w));
if (missing.length > 0) console.log(`Kept function words not in the list: ${missing.join(", ")}`);

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
