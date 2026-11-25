// Placement-test pseudowords: Claude proposes Spanish-looking made-up words, and code drops
// any that are real words or near-misses of common ones. Writes content/pseudowords.json,
// which the owner reviews; content:upload imports the kept words as drafts.
//
//   npm run content:pseudowords              # estimate
//   npm run content:pseudowords -- --yes     # about $0.10
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { filterPseudowords } from "./lib/pseudowords.ts";
import { costUsd, formatUsd, isOutOfCredit } from "./lib/run.ts";
import { cached, loadLemmaIndex, SOURCES } from "./lib/sources.ts";
import { parseFrequencyList } from "./lib/word-list.ts";

const MODEL = "claude-opus-5-5";
const ASK_FOR = 320;
/** Near-misses of this many of the most frequent forms are dropped. */
const COMMON_FORMS = 5000;

const prompt = `Write ${ASK_FOR} made-up words that look and sound like real Spanish words but are not
Spanish words in any form, for a vocabulary placement test: learners say whether they know
each word, and saying yes to a made-up word shows they are guessing.

- Lowercase, 4 to 12 letters, using only Spanish spelling (á é í ó ú ü ñ allowed where
  Spanish rules would put them).
- Follow common Spanish patterns: syllables, endings like -ar, -ero, -ción, -oso, -mente,
  -idad, and noun, verb and adjective shapes. Vary the length and the first letter.
- Not a real word in Spanish or English, not a conjugated or plural form of a real word,
  not a name, and not a real word with one letter changed.
- Nothing that sounds rude or offensive in Spanish or English.`;

const schema = z.object({ words: z.array(z.string()) });

if (!process.argv.includes("--yes")) {
  console.log(
    `One request to ${MODEL} for ${ASK_FOR} candidates: about 8,000 output tokens, roughly ` +
      `${formatUsd(costUsd(MODEL, { input_tokens: 400, output_tokens: 8000 }, false))}. ` +
      "Nothing was sent. Run again with --yes.",
  );
  process.exit(0);
}

console.log("Loading Wiktionary and the frequency list...");
const { index } = await loadLemmaIndex();
const forms = parseFrequencyList(readFileSync(await cached(SOURCES.frequency), "utf8"));
const known = new Set([...index.formsOf.keys(), ...forms.map((f) => f.form)]);
const common = forms.slice(0, COMMON_FORMS).map((f) => f.form);

const format = zodOutputFormat(schema);
let message;
try {
  message = await new Anthropic().messages.create({
    model: MODEL,
    max_tokens: 16_000,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: "medium", format: { type: format.type, schema: format.schema } },
  });
} catch (err) {
  if (isOutOfCredit(err)) {
    console.error("Anthropic says the account is out of credit. Add credit and run again.");
    process.exit(2);
  }
  throw err;
}
const text = message.content.find((b) => b.type === "text");
if (message.stop_reason !== "end_turn" || !text || text.type !== "text")
  throw new Error(`No usable answer (stop reason ${message.stop_reason}).`);
const { words } = schema.parse(JSON.parse(text.text));

const verdicts = filterPseudowords(words, known, common);
const kept = verdicts.filter((v) => v.ok).map((v) => v.word);
const dropped = verdicts.filter((v) => !v.ok);
writeFileSync(
  new URL("../../content/pseudowords.json", import.meta.url),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      model: MODEL,
      note: "Kept words are imported as drafts and reviewed before placement uses them.",
      words: kept,
      dropped: dropped.map((d) => `${d.word}: ${d.reason}`),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `${words.length} proposed, ${kept.length} kept, ${dropped.length} dropped. ` +
    `${formatUsd(costUsd(MODEL, message.usage, false))} spent. Wrote content/pseudowords.json.`,
);
