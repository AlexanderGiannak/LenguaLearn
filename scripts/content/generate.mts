// Content pipeline step 2: generation. For each candidate word, the Claude API writes the
// senses, examples, hooks, relations and misuse sentences in a strict JSON schema.
//
//   npm run content:generate -- --ranks 1-20 --now            # estimate a 20-word sample
//   npm run content:generate -- --ranks 1-20 --now --yes      # run it, answers in minutes
//   npm run content:generate -- --ranks 1-500 --yes --budget 30   # a batch (half price)
//   npm run content:generate                                  # collect finished batches
//
// Nothing is sent without --yes; the estimate is printed first, and --budget refuses a run
// whose estimate is higher. Every answer is written to content/generated/ as it arrives,
// so running the same command again resumes: finished words are skipped, and batches still
// running are collected. If the account runs out of credit, the script stops, keeps what
// it has, and says how to resume. Only content goes to the API, never student data.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseCandidates, type CandidateRow } from "./lib/candidates.ts";
import {
  generatedWordSchema,
  VOCABULARY_LIMITED_LEVELS,
  type GeneratedFile,
} from "./lib/generated.ts";
import { costUsd, estimateRunUsd, formatUsd, isOutOfCredit, type Usage } from "./lib/run.ts";

const MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16_000;
/** Output tokens per word (thinking included), until generated words give a measurement. */
const DEFAULT_OUTPUT_TOKENS = 5000;
const NOW_CONCURRENCY = 3;

const root = new URL("../../content/", import.meta.url);
const dirs = {
  generated: new URL("generated/", root),
  raw: new URL("raw/generate/", root),
  state: new URL("state/", root),
};
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
const statePath = new URL("generate.json", dirs.state);

// --- Arguments -------------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const effort = (value("--effort") ?? "high") as "low" | "medium" | "high" | "xhigh" | "max";
const budget = value("--budget") ? Number(value("--budget")) : undefined;
const now = flag("--now");
const yes = flag("--yes");
const rangeArg = value("--ranks");

// --- Inputs ------------------------------------------------------------------------------

const candidates = parseCandidates(readFileSync(new URL("candidates.csv", root), "utf8"));
const byLemma = new Map(candidates.map((c) => [c.lemma, c]));
const prompt = readFileSync(new URL("prompts/generate-word.md", root), "utf8");
const vocabularyRule = readFileSync(new URL("prompts/vocabulary-rule.md", root), "utf8");

function selected(): CandidateRow[] {
  if (!rangeArg) return [];
  const m = /^(\d+)-(\d+)$/.exec(rangeArg);
  if (!m) throw new Error("--ranks takes a range such as 1-20");
  const [from, to] = [Number(m[1]), Number(m[2])];
  return candidates.filter((c) => c.rank >= from && c.rank <= to);
}

/** The cached system prompt for a level: the rules, plus the vocabulary list if limited. */
function systemFor(level: number): string {
  const rule =
    level <= VOCABULARY_LIMITED_LEVELS
      ? vocabularyRule.replace("{{level}}", String(level)).replace(
          "{{vocabulary}}",
          candidates
            .filter((c) => c.level <= level)
            .map((c) => c.lemma)
            .join(", "),
        )
      : `This word is at level ${level}. Use everyday words a learner at this level already knows; avoid rare words.`;
  return prompt.replace("{{vocabulary_rule}}", rule.trim());
}

function params(c: CandidateRow): Anthropic.MessageCreateParamsNonStreaming {
  const format = zodOutputFormat(generatedWordSchema);
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text", text: systemFor(c.level), cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          candidate: c.lemma,
          partsOfSpeech: c.pos,
          frequencyRank: c.rank,
          level: c.level,
          themes: c.themes,
          notes: c.notes || null,
        }),
      },
    ],
    output_config: { effort, format: { type: format.type, schema: format.schema } },
  };
}

// --- Output files ------------------------------------------------------------------------

const fileName = (lemma: string) => `${encodeURIComponent(lemma)}.json`;
const generatedPath = (lemma: string) => new URL(fileName(lemma), dirs.generated);

function done(): Map<string, GeneratedFile> {
  const files = new Map<string, GeneratedFile>();
  for (const name of readdirSync(dirs.generated)) {
    // iCloud makes "name 2.json" copies of synced files; they are not ours.
    if (!name.endsWith(".json") || / \d+\.json$/.test(name)) continue;
    const file = JSON.parse(readFileSync(new URL(name, dirs.generated), "utf8")) as GeneratedFile;
    files.set(file.candidate.lemma, file);
  }
  return files;
}

/** Validates one answer and writes it. Returns an error message instead of throwing. */
function save(
  lemma: string,
  message: { content: Anthropic.ContentBlock[]; usage: Usage; stop_reason: string | null },
  batch: boolean,
): string | null {
  writeFileSync(new URL(fileName(lemma), dirs.raw), JSON.stringify(message, null, 2));
  if (message.stop_reason !== "end_turn") return `stopped with ${message.stop_reason}`;
  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return "no text in the answer";
  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    return "the answer is not valid JSON";
  }
  const parsed = generatedWordSchema.safeParse(json);
  if (!parsed.success) return `answer does not match the schema: ${parsed.error.message}`;
  const candidate = byLemma.get(lemma)!;
  const file: GeneratedFile = {
    candidate,
    model: MODEL,
    effort,
    batch,
    generatedAt: new Date().toISOString(),
    usage: message.usage,
    costUsd: costUsd(MODEL, message.usage, batch),
    output: parsed.data,
  };
  writeFileSync(generatedPath(lemma), JSON.stringify(file, null, 2) + "\n");
  return null;
}

// --- Batch state -------------------------------------------------------------------------

/** customIds maps each request's ID (letters, digits, - and _ only) to its word. */
type State = {
  batches: {
    id: string;
    submittedAt: string;
    lemmas: string[];
    customIds: Record<string, string>;
    collected: boolean;
  }[];
};
const state: State = existsSync(statePath)
  ? (JSON.parse(readFileSync(statePath, "utf8")) as State)
  : { batches: [] };
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

const client = new Anthropic();

function outOfCredit(): never {
  console.error(
    "\nAnthropic says the account is out of credit. Everything finished so far is saved in" +
      " content/generated/.\nAdd credit at console.anthropic.com, then run the same command" +
      " again: it picks up where this stopped.",
  );
  process.exit(2);
}

async function collectBatches(): Promise<void> {
  for (const b of state.batches.filter((b) => !b.collected)) {
    const batch = await client.messages.batches.retrieve(b.id);
    if (batch.processing_status !== "ended") {
      const c = batch.request_counts;
      console.log(
        `Batch ${b.id}: still running (${c.succeeded + c.errored} of ${b.lemmas.length} done).`,
      );
      continue;
    }
    let ok = 0;
    let spent = 0;
    const problems: string[] = [];
    let credit = false;
    for await (const r of await client.messages.batches.results(b.id)) {
      const lemma = b.customIds[r.custom_id];
      if (!lemma) throw new Error(`Batch ${b.id} returned an unknown request ${r.custom_id}`);
      if (r.result.type === "succeeded") {
        const problem = save(lemma, r.result.message, true);
        spent += costUsd(MODEL, r.result.message.usage, true);
        if (problem) problems.push(`${lemma}: ${problem}`);
        else ok++;
      } else if (r.result.type === "errored") {
        if (isOutOfCredit(r.result.error.error)) credit = true;
        problems.push(`${lemma}: ${r.result.error.error.type}`);
      } else problems.push(`${lemma}: ${r.result.type}`);
    }
    b.collected = true;
    saveState();
    console.log(`Batch ${b.id}: ${ok} words saved, ${formatUsd(spent)} spent.`);
    for (const p of problems) console.log(`  not saved, will retry on the next run: ${p}`);
    if (credit) outOfCredit();
  }
}

// --- Run ---------------------------------------------------------------------------------

async function main(): Promise<void> {
  await collectBatches();
  const finished = done();
  const inFlight = new Set(state.batches.filter((b) => !b.collected).flatMap((b) => b.lemmas));
  const todo = selected().filter((c) => !finished.has(c.lemma) && !inFlight.has(c.lemma));
  if (!rangeArg) return;
  if (todo.length === 0) {
    console.log("Every word in that range is generated or waiting in a running batch.");
    return;
  }

  // Estimate: measured input tokens for the first word; output tokens from finished words.
  const first = params(todo[0]!);
  const counted = await client.messages.countTokens({
    model: MODEL,
    system: first.system,
    messages: first.messages,
  });
  const measured = [...finished.values()].map((f) => f.usage.output_tokens);
  const outputPerWord = measured.length
    ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length)
    : DEFAULT_OUTPUT_TOKENS;
  const estimate = estimateRunUsd({
    model: MODEL,
    requests: todo.length,
    inputTokensPerRequest: counted.input_tokens,
    outputTokensPerRequest: outputPerWord,
    batch: !now,
  });
  console.log(
    `${todo.length} words to generate with ${MODEL} (effort ${effort}, ${now ? "now" : "batch, half price"}).` +
      `\nAbout ${counted.input_tokens} input tokens and ${outputPerWord} output tokens per word` +
      `${measured.length ? ` (measured over ${measured.length} words)` : " (a guess until a sample is measured)"}.` +
      `\nEstimated cost: ${formatUsd(estimate)} (prompt caching makes it lower).`,
  );
  if (budget !== undefined && estimate > budget) {
    console.log(`That is over the --budget of ${formatUsd(budget)}. Nothing was sent.`);
    return;
  }
  if (!yes) {
    console.log("Nothing was sent. Run again with --yes to start.");
    return;
  }

  if (now) await runNow(todo);
  else await submitBatch(todo);
}

async function submitBatch(todo: CandidateRow[]): Promise<void> {
  const customIds = Object.fromEntries(todo.map((c, i) => [`w-${i}`, c.lemma]));
  try {
    const batch = await client.messages.batches.create({
      requests: todo.map((c, i) => ({ custom_id: `w-${i}`, params: params(c) })),
    });
    state.batches.push({
      id: batch.id,
      submittedAt: new Date().toISOString(),
      lemmas: todo.map((c) => c.lemma),
      customIds,
      collected: false,
    });
    saveState();
    console.log(
      `Submitted batch ${batch.id}. Most batches finish within an hour.` +
        "\nRun `npm run content:generate` later to collect the results.",
    );
  } catch (err) {
    if (isOutOfCredit(err)) outOfCredit();
    throw err;
  }
}

async function runNow(todo: CandidateRow[]): Promise<void> {
  const queue = [...todo];
  let spent = 0;
  let saved = 0;
  let stop: "credit" | "budget" | null = null;
  const problems: string[] = [];
  async function worker(): Promise<void> {
    while (queue.length && !stop) {
      const c = queue.shift()!;
      try {
        // Server-side fallback: if the model declines on safety grounds, another model
        // answers in the same call (not available for batches).
        const message = await client.beta.messages.create({
          ...params(c),
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as Anthropic.Beta.MessageCreateParamsNonStreaming);
        spent += costUsd(MODEL, message.usage, false);
        const problem = save(c.lemma, message as unknown as Parameters<typeof save>[1], false);
        if (problem) problems.push(`${c.lemma}: ${problem}`);
        else {
          saved++;
          console.log(`  ${c.rank} ${c.lemma}  (${formatUsd(spent)} so far)`);
        }
        if (budget !== undefined && spent > budget) stop = "budget";
      } catch (err) {
        if (isOutOfCredit(err)) stop = "credit";
        else problems.push(`${c.lemma}: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: NOW_CONCURRENCY }, worker));
  console.log(`${saved} words saved, ${formatUsd(spent)} spent.`);
  for (const p of problems) console.log(`  not saved, will retry on the next run: ${p}`);
  if (stop === "budget") console.log(`Stopped at the --budget of ${formatUsd(budget!)}.`);
  if (stop === "credit") outOfCredit();
}

await main();
