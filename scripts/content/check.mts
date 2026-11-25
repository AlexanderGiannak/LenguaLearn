// Content pipeline step 3: the independent check. Every generated word gets the automatic
// checks, and a review by a model from another provider (OpenAI), which sees only the
// content, never how it was written. Results go to content/checked/, one file per word.
//
//   npm run content:check                        # automatic checks; collect finished reviews
//   npm run content:check -- --review            # estimate reviewing every unreviewed word
//   npm run content:check -- --review --yes --budget 5   # send them as a batch (half price)
//   npm run content:check -- --review --now --yes        # small runs, answers in minutes
//
// Like generation, nothing is sent without --yes, each review is saved as it arrives, a
// run that stops (including running out of credit) resumes when run again, and a word that
// was regenerated is reviewed again. Only content goes to OpenAI, never student data.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { parseCandidates } from "./lib/candidates.ts";
import { checkSense, type Failure } from "./lib/checks.ts";
import { toImportLemmas, type CheckedWord } from "./lib/to-import.ts";
import { MAX_LEMMAS_PER_IMPORT, type ImportPayloadInput } from "../../lib/content/import-schema.ts";
import { VOCABULARY_LIMITED_LEVELS, type GeneratedFile } from "./lib/generated.ts";
import { reviewFailures, reviewInput, reviewSchema, type Review } from "./lib/review.ts";
import {
  costUsd,
  estimateRunUsd,
  formatUsd,
  isOutOfCredit,
  measureUsage,
  openAiUsage,
  type Usage,
} from "./lib/run.ts";
import { loadLemmaIndex } from "./lib/sources.ts";

const MODEL = "gpt-6.2-sol";
const EFFORT = "medium";
/** Output tokens per review (reasoning included), until reviews give a measurement. */
const DEFAULT_OUTPUT_TOKENS = 3000;
const NOW_CONCURRENCY = 3;

const root = new URL("../../content/", import.meta.url);
const dirs = {
  generated: new URL("generated/", root),
  reviewed: new URL("reviewed/", root),
  checked: new URL("checked/", root),
  import: new URL("import/", root),
  raw: new URL("raw/check/", root),
  state: new URL("state/", root),
};
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
const statePath = new URL("check.json", dirs.state);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const review = flag("--review");
const now = flag("--now");
const yes = flag("--yes");
const budget = value("--budget") ? Number(value("--budget")) : undefined;

const instructions = readFileSync(new URL("prompts/check-word.md", root), "utf8");
const promptVersion = createHash("sha256").update(instructions).digest("hex").slice(0, 12);

const isOurs = (n: string) => n.endsWith(".json") && !/ \d+\.json$/.test(n);
const fileName = (lemma: string) => `${encodeURIComponent(lemma)}.json`;
const readJson = <T,>(url: URL) => JSON.parse(readFileSync(url, "utf8")) as T;

const candidates = parseCandidates(readFileSync(new URL("candidates.csv", root), "utf8"));
const generated = readdirSync(dirs.generated)
  .filter(isOurs)
  .map((n) => readJson<GeneratedFile>(new URL(n, dirs.generated)))
  .filter((f) => !f.output.skipReason)
  .sort((a, b) => a.candidate.rank - b.candidate.rank);
const byLemma = new Map(generated.map((f) => [f.candidate.lemma, f]));

// --- Reviews ---------------------------------------------------------------------------

type ReviewedFile = {
  lemma: string;
  /** generatedAt of the generated file reviewed. */
  generatedAt: string;
  model: string;
  promptVersion: string;
  reviewedAt: string;
  usage: Usage;
  costUsd: number;
  review: Review;
};

function reviewOf(f: GeneratedFile): ReviewedFile | null {
  const path = new URL(fileName(f.candidate.lemma), dirs.reviewed);
  if (!existsSync(path)) return null;
  const r = readJson<ReviewedFile>(path);
  // A regenerated word, or a changed review prompt, means the word is reviewed again.
  return r.generatedAt === f.generatedAt && r.promptVersion === promptVersion ? r : null;
}

function body(f: GeneratedFile) {
  return {
    model: MODEL,
    instructions,
    input: JSON.stringify(reviewInput(f.output, f.candidate)),
    reasoning: { effort: EFFORT },
    text: { format: zodTextFormat(reviewSchema, "word_review") },
  } as const;
}

type RawResponse = {
  status?: string;
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: Parameters<typeof openAiUsage>[0];
};

/** Validates one response and saves the review. Returns a problem instead of throwing. */
function saveReview(lemma: string, res: RawResponse, batch: boolean): string | null {
  writeFileSync(new URL(fileName(lemma), dirs.raw), JSON.stringify(res, null, 2));
  const f = byLemma.get(lemma);
  if (!f) return "the generated word is gone";
  if (res.status !== "completed") return `response ${res.status}`;
  const text = res.output
    ?.flatMap((o) => (o.type === "message" ? (o.content ?? []) : []))
    .find((c) => c.type === "output_text")?.text;
  if (!text || !res.usage) return "no answer text";
  let parsed;
  try {
    parsed = reviewSchema.safeParse(JSON.parse(text));
  } catch {
    return "the answer is not valid JSON";
  }
  if (!parsed.success) return `answer does not match the schema: ${parsed.error.message}`;
  const usage = openAiUsage(res.usage);
  const file: ReviewedFile = {
    lemma,
    generatedAt: f.generatedAt,
    model: MODEL,
    promptVersion,
    reviewedAt: new Date().toISOString(),
    usage,
    costUsd: costUsd(MODEL, usage, batch),
    review: parsed.data,
  };
  writeFileSync(new URL(fileName(lemma), dirs.reviewed), JSON.stringify(file, null, 2) + "\n");
  return null;
}

type State = {
  batches: { id: string; submittedAt: string; lemmas: string[]; collected: boolean }[];
};
const state: State = existsSync(statePath) ? readJson<State>(statePath) : { batches: [] };
const saveState = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI());

function outOfCredit(): never {
  console.error(
    "\nOpenAI says the account is out of credit. Every review finished so far is saved in" +
      " content/reviewed/.\nAdd credit at platform.openai.com, then run the same command" +
      " again: it picks up where this stopped.",
  );
  process.exit(2);
}

async function collectBatches(): Promise<void> {
  const open = state.batches.filter((b) => !b.collected);
  if (open.length === 0) return;
  for (const b of open) {
    const batch = await openai().batches.retrieve(b.id);
    if (batch.status === "failed") {
      const errors = batch.errors?.data ?? [];
      b.collected = true;
      saveState();
      console.log(`Review batch ${b.id} failed: ${errors.map((e) => e.message).join("; ")}`);
      if (errors.some((e) => /quota|billing|credit/i.test(`${e.code} ${e.message}`))) outOfCredit();
      continue;
    }
    if (!["completed", "expired", "cancelled"].includes(batch.status)) {
      const c = batch.request_counts;
      console.log(
        `Review batch ${b.id}: ${batch.status} (${c ? c.completed + c.failed : 0} of ${b.lemmas.length} done).`,
      );
      continue;
    }
    let ok = 0;
    let spent = 0;
    let credit = false;
    const problems: string[] = [];
    for (const fileId of [batch.output_file_id, batch.error_file_id]) {
      if (!fileId) continue;
      const lines = (await (await openai().files.content(fileId)).text()).split("\n");
      for (const line of lines.filter(Boolean)) {
        const r = JSON.parse(line) as {
          custom_id: string;
          response?: { status_code: number; body: RawResponse & { error?: unknown } };
          error?: { code?: string; message?: string } | null;
        };
        const lemma = decodeURIComponent(r.custom_id.replace(/^w-/, ""));
        const res = r.response;
        if (res?.status_code === 200) {
          const problem = saveReview(lemma, res.body, true);
          if (res.body.usage) spent += costUsd(MODEL, openAiUsage(res.body.usage), true);
          if (problem) problems.push(`${lemma}: ${problem}`);
          else ok++;
        } else {
          const err = r.error ?? res?.body?.error;
          if (isOutOfCredit({ status: res?.status_code, ...(err as object) })) credit = true;
          problems.push(`${lemma}: ${JSON.stringify(err)}`);
        }
      }
    }
    b.collected = true;
    saveState();
    console.log(`Review batch ${b.id}: ${ok} reviews saved, ${formatUsd(spent)} spent.`);
    for (const p of problems) console.log(`  not saved, will retry on the next run: ${p}`);
    if (credit) outOfCredit();
  }
}

async function sendReviews(): Promise<void> {
  const inFlight = new Set(state.batches.filter((b) => !b.collected).flatMap((b) => b.lemmas));
  const todo = generated.filter((f) => !reviewOf(f) && !inFlight.has(f.candidate.lemma));
  if (todo.length === 0) {
    console.log("Every generated word is reviewed or waiting in a running batch.");
    return;
  }
  const usages = readdirSync(dirs.reviewed)
    .filter(isOurs)
    .map((n) => readJson<ReviewedFile>(new URL(n, dirs.reviewed)).usage);
  const measured = measureUsage(usages);
  // About 4 characters per token for this mix of JSON, English and Spanish.
  const inputTokens = Math.round(
    todo.reduce((n, f) => n + instructions.length + body(f).input.length, 0) / todo.length / 4,
  );
  const estimate = estimateRunUsd({
    model: MODEL,
    requests: todo.length,
    inputTokensPerRequest: inputTokens,
    outputTokensPerRequest: measured?.outputTokens ?? DEFAULT_OUTPUT_TOKENS,
    cachedShare: measured?.cachedShare,
    batch: !now,
  });
  console.log(
    `${todo.length} words to review with ${MODEL} (effort ${EFFORT}, ${now ? "now" : "batch, half price"}).` +
      `\nAbout ${inputTokens} input and ${measured?.outputTokens ?? DEFAULT_OUTPUT_TOKENS} output tokens per word` +
      `${measured ? ` (output measured over ${usages.length} reviews)` : " (a guess until reviews are measured)"}.` +
      `\nEstimated cost: ${formatUsd(estimate)}.`,
  );
  if (budget !== undefined && estimate > budget) {
    console.log(`That is over the --budget of ${formatUsd(budget)}. Nothing was sent.`);
    return;
  }
  if (!yes) {
    console.log("Nothing was sent. Run again with --yes to start.");
    return;
  }
  try {
    if (now) await reviewNow(todo);
    else await submitBatch(todo);
  } catch (err) {
    if (isOutOfCredit(err)) outOfCredit();
    throw err;
  }
}

async function submitBatch(todo: GeneratedFile[]): Promise<void> {
  const jsonl = todo
    .map((f) =>
      JSON.stringify({
        custom_id: `w-${encodeURIComponent(f.candidate.lemma)}`,
        method: "POST",
        url: "/v1/responses",
        body: body(f),
      }),
    )
    .join("\n");
  const file = await openai().files.create({
    file: await toFile(Buffer.from(jsonl), "reviews.jsonl"),
    purpose: "batch",
  });
  const batch = await openai().batches.create({
    input_file_id: file.id,
    endpoint: "/v1/responses",
    completion_window: "24h",
  });
  state.batches.push({
    id: batch.id,
    submittedAt: new Date().toISOString(),
    lemmas: todo.map((f) => f.candidate.lemma),
    collected: false,
  });
  saveState();
  console.log(
    `Submitted review batch ${batch.id}. Batches finish within 24 hours, usually much sooner.` +
      "\nRun `npm run content:check` later to collect the results.",
  );
}

async function reviewNow(todo: GeneratedFile[]): Promise<void> {
  const queue = [...todo];
  let spent = 0;
  let stop: "credit" | "budget" | null = null;
  const problems: string[] = [];
  async function worker(): Promise<void> {
    while (queue.length && !stop) {
      const f = queue.shift()!;
      try {
        const res = (await openai().responses.create(body(f))) as unknown as RawResponse;
        if (res.usage) spent += costUsd(MODEL, openAiUsage(res.usage), false);
        const problem = saveReview(f.candidate.lemma, res, false);
        if (problem) problems.push(`${f.candidate.lemma}: ${problem}`);
        else
          console.log(`  ${f.candidate.rank} ${f.candidate.lemma}  (${formatUsd(spent)} so far)`);
        if (budget !== undefined && spent > budget) stop = "budget";
      } catch (err) {
        if (isOutOfCredit(err)) stop = "credit";
        else problems.push(`${f.candidate.lemma}: ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: NOW_CONCURRENCY }, worker));
  console.log(`${formatUsd(spent)} spent.`);
  for (const p of problems) console.log(`  not saved, will retry on the next run: ${p}`);
  if (stop === "budget") console.log(`Stopped at the --budget of ${formatUsd(budget!)}.`);
  if (stop === "credit") outOfCredit();
}

// --- Automatic checks and results --------------------------------------------------------

async function writeResults(): Promise<void> {
  if (generated.length === 0) {
    console.log("Nothing in content/generated/ yet. Run npm run content:generate first.");
    return;
  }
  console.log("Loading Wiktionary...");
  const { index } = await loadLemmaIndex();
  const allowedByLevel = new Map<number, Set<string>>();
  const allowed = (level: number) => {
    if (level > VOCABULARY_LIMITED_LEVELS) return undefined;
    if (!allowedByLevel.has(level))
      allowedByLevel.set(
        level,
        new Set(candidates.filter((c) => c.level <= level).map((c) => c.lemma)),
      );
    return allowedByLevel.get(level);
  };

  const seen = new Map<string, string>();
  const results: CheckedWord[] = [];
  const tally = new Map<string, number>();
  let clean = 0;
  let unreviewed = 0;
  for (const f of generated) {
    const { candidate, output } = f;
    const reviewed = reviewOf(f);
    const fromReview = reviewed ? reviewFailures(output, reviewed.review) : [];
    const failures: Failure[] = [...fromReview];
    const lemmas = output.lemmas.map((l, li) => ({
      ...l,
      senses: l.senses.map((s, si) => {
        const path = `lemmas.${li}.senses.${si}`;
        const auto = checkSense(l.headword, s, path, index, seen, allowed(candidate.level));
        // A sense's failures include its lemma's (a wrong gender fails every sense).
        const own = fromReview.filter(
          (x) =>
            x.field === path ||
            x.field.startsWith(`${path}.`) ||
            (x.field.startsWith(`lemmas.${li}.`) && !x.field.includes(".senses.")) ||
            x.field === "lemmas",
        );
        failures.push(...auto.failures);
        return {
          ...s,
          examples: auto.examples,
          failures: [...auto.failures, ...own],
          reviewerGloss: reviewed?.review.lemmas[li]?.senses[si]?.ownGloss ?? null,
        };
      }),
    }));
    if (lemmas.length === 0)
      failures.push({ field: "lemmas", check: "empty", message: "no lemmas and no skip reason" });
    for (const x of failures) tally.set(x.check, (tally.get(x.check) ?? 0) + 1);
    if (!reviewed) unreviewed++;
    else if (failures.length === 0) clean++;
    const checked: CheckedWord = {
      candidate,
      checkedAt: new Date().toISOString(),
      reviewed: !!reviewed,
      failures,
      lemmas,
    };
    results.push(checked);
    writeFileSync(
      new URL(fileName(candidate.lemma), dirs.checked),
      JSON.stringify(checked, null, 2) + "\n",
    );
    if (failures.length)
      console.log(
        `${candidate.rank} ${candidate.lemma}: ${failures.map((x) => `${x.field} ${x.check}: ${x.message}`).join("; ")}`,
      );
  }
  console.log(
    `\n${generated.length} words checked: ${clean} reviewed with no failures, ` +
      `${generated.length - clean - unreviewed} with failures, ${unreviewed} not reviewed yet.`,
  );
  for (const [check, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${check}: ${n}`);
  writeImports(results);
}

/**
 * Writes content/import/import-NNN.json, ready for the admin import endpoint, at most
 * MAX_LEMMAS_PER_IMPORT lemmas per file, in rank order. Rewritten in full on every run.
 */
function writeImports(results: CheckedWord[]): void {
  rmSync(dirs.import, { recursive: true, force: true });
  mkdirSync(dirs.import, { recursive: true });
  const lemmas: ImportPayloadInput["lemmas"] = [];
  const owner = new Map<string, string>();
  for (const word of results) {
    const { lemmas: converted, refused } = toImportLemmas(word);
    for (const r of refused)
      console.log(`Not importable, fix by hand or regenerate: ${r.key}: ${r.problems.join("; ")}`);
    for (const l of converted) {
      const first = owner.get(l.key);
      if (first) {
        console.log(
          `${l.key} from "${word.candidate.lemma}" repeats it from "${first}"; left out.`,
        );
        continue;
      }
      owner.set(l.key, word.candidate.lemma);
      lemmas.push(l);
    }
  }
  const files = Math.ceil(lemmas.length / MAX_LEMMAS_PER_IMPORT);
  for (let i = 0; i < files; i++) {
    const payload: ImportPayloadInput = {
      note: `Content pipeline, checked ${new Date().toISOString().slice(0, 10)}`,
      lemmas: lemmas.slice(i * MAX_LEMMAS_PER_IMPORT, (i + 1) * MAX_LEMMAS_PER_IMPORT),
    };
    const name = `import-${String(i + 1).padStart(3, "0")}.json`;
    writeFileSync(new URL(name, dirs.import), JSON.stringify(payload, null, 2) + "\n");
  }
  const checked = lemmas.flatMap((l) => l.senses).filter((s) => s.status === "ai_checked").length;
  const senses = lemmas.reduce((n, l) => n + l.senses.length, 0);
  console.log(
    `\nWrote ${files} import file(s) in content/import/: ${lemmas.length} lemmas, ${senses} senses, ` +
      `${checked} ai_checked and ${senses - checked} for review.`,
  );
}

if (review || state.batches.some((b) => !b.collected)) await collectBatches();
if (review) await sendReviews();
await writeResults();
