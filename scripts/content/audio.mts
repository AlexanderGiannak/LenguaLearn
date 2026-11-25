// Content pipeline step 6: recordings for every headword and example sentence.
//
//   npm run content:audio                                  # what's missing and what it costs
//   npm run content:audio -- --yes                         # make them for the local app
//   npm run content:audio -- https://lengualearn.com --yes # for the real site (S3 bucket)
//   npm run content:audio -- --word perro#noun --yes       # make one word's recordings again
//
// The app says what needs a recording (its current text, so a reviewer's edits are what
// gets spoken), OpenAI's gpt-4o-mini-tts speaks it in the marin voice, ffmpeg evens out the
// loudness, and the file goes to public/audio/ for the local app or to the media bucket
// (MEDIA_BUCKET) for a deployed one. The app then attaches it as a draft for review.
// Only content text is sent to OpenAI, never student data.
//
// Finished files are kept in content/audio/, so a stopped run (Ctrl-C, out of credit, the
// budget) resumes without paying twice: run the same command again.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import OpenAI from "openai";
import {
  audioFileKey,
  estimateTtsUsd,
  gainDb,
  parseLoudnorm,
  TTS_INSTRUCTIONS,
  TTS_MODEL,
  TTS_VOICE,
  VOICE_ID,
} from "./lib/audio.ts";
import { formatUsd, isOutOfCredit } from "./lib/run.ts";

const run = promisify(execFile);

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const valueFlags = new Set(["--word", "--budget", "--limit"]);
const baseUrl = (
  args.find((a, i) => !a.startsWith("--") && !valueFlags.has(args[i - 1] ?? "")) ??
  "http://localhost:3000"
).replace(/\/$/, "");
const yes = args.includes("--yes");
const word = flag("--word");
const budget = Number(flag("--budget") ?? "2");
const limit = Number(flag("--limit") ?? "Infinity");
if (!Number.isFinite(budget) || budget <= 0) throw new Error("--budget must be a positive number");

const token = process.env.ADMIN_API_TOKEN;
if (!token) {
  console.error("ADMIN_API_TOKEN is not set. Run `npm run admin:token` to make one.");
  process.exit(1);
}
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl);
const bucket = process.env.MEDIA_BUCKET;
if (!local && !bucket) {
  console.error("MEDIA_BUCKET is not set: a deployed site's recordings go to the media bucket.");
  process.exit(1);
}

type Need = {
  owner: "lemma" | "example";
  id: number;
  key: string;
  text: string;
  /** A reviewer flagged the last recording of this text: make a fresh one. */
  remake: boolean;
};
type Attach = Pick<Need, "owner" | "id" | "text"> & {
  fileKey: string;
  voiceId: string;
  generatedAt: string;
};

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body.error ?? ""}`);
  return body;
}

const query = word ? `?lemma=${encodeURIComponent(word)}&all=1` : "";
const { needs: all } = (await api(`/api/admin/audio${query}`)) as { needs: Need[] };
const needs = all.slice(0, limit);
const estimate = estimateTtsUsd(needs.map((n) => n.text));
const words = new Set(needs.map((n) => n.key.split("#").slice(0, 2).join("#"))).size;
console.log(
  `${needs.length} recording(s) to make for ${words} word(s) on ${baseUrl}` +
    `${all.length > needs.length ? ` (of ${all.length}; --limit)` : ""}. ` +
    `At most about ${formatUsd(estimate)} of OpenAI credit (budget ${formatUsd(budget)}).`,
);
if (needs.length === 0) process.exit(0);
if (!yes) {
  console.log(
    local
      ? "Add --yes to make them."
      : `Add --yes to make them and upload them to s3://${bucket}/ for ${baseUrl}.`,
  );
  process.exit(0);
}

for (const tool of ["ffmpeg", ...(local ? [] : ["aws"])]) {
  try {
    // ffmpeg takes -version; the AWS CLI only --version.
    await run(tool, [tool === "aws" ? "--version" : "-version"]);
  } catch {
    console.error(`${tool} is not installed (brew install ${tool === "aws" ? "awscli" : tool}).`);
    process.exit(1);
  }
}

const root = new URL("../../", import.meta.url);
const cacheDir = fileURLToPath(new URL("content/audio/", root));
const publicDir = fileURLToPath(new URL("public/", root));
mkdirSync(join(cacheDir, "audio"), { recursive: true });
const work = mkdtempSync(join(tmpdir(), "lengualearn-audio-"));

const client = new OpenAI();
// A remade word gets new files (a new take); everything else is made once per text.
const take = word ? new Date().toISOString() : undefined;
let spent = 0;
let stop: string | null = null;
const ready: Attach[] = [];
let attached = 0;
let stale = 0;

async function make(need: Need): Promise<string> {
  // A flagged recording is made fresh, never taken from the cache.
  const fileKey = audioFileKey(
    need.text,
    take ?? (need.remake ? new Date().toISOString() : undefined),
  );
  const cached = join(cacheDir, fileKey);
  if (!existsSync(cached)) {
    const res = await client.audio.speech.create({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: need.text,
      instructions: TTS_INSTRUCTIONS,
      response_format: "wav",
    });
    spent += estimateTtsUsd([need.text]);
    const wav = join(work, `${need.owner}-${need.id}.wav`);
    writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
    const measured = await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        wav,
        "-af",
        "loudnorm=print_format=json",
        "-f",
        "null",
        "-",
      ],
      { maxBuffer: 1 << 20 },
    );
    const gain = gainDb(parseLoudnorm(measured.stderr));
    // Leading silence is trimmed so the word starts as soon as the button is pressed.
    const mp3 = join(work, `${need.owner}-${need.id}.mp3`);
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      wav,
      "-af",
      `silenceremove=start_periods=1:start_threshold=-50dB,volume=${gain}dB`,
      "-ac",
      "1",
      "-ar",
      "24000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "48k",
      mp3,
    ]);
    copyFileSync(mp3, cached);
  }
  if (local) {
    mkdirSync(join(publicDir, "audio"), { recursive: true });
    copyFileSync(cached, join(publicDir, fileKey));
  } else {
    // Each path is a new file that never changes, so browsers and CloudFront keep it a year.
    await run(
      "aws",
      [
        "s3",
        "cp",
        cached,
        `s3://${bucket}/${fileKey}`,
        "--content-type",
        "audio/mpeg",
        "--cache-control",
        "public, max-age=31536000, immutable",
        "--only-show-errors",
      ],
      { env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE ?? "lengualearn" } },
    );
  }
  return fileKey;
}

async function flush() {
  while (ready.length > 0) {
    const items = ready.splice(0, 100);
    const r = (await api("/api/admin/audio", {
      method: "POST",
      body: JSON.stringify({ items }),
    })) as { attached: number; unchanged: number; stale: unknown[] };
    attached += r.attached + r.unchanged;
    stale += r.stale.length;
  }
}

// Four at a time: fast enough for a few thousand clips, well under OpenAI's rate limits.
let next = 0;
let done = 0;
async function worker() {
  while (!stop && next < needs.length) {
    const need = needs[next++]!;
    if (spent + estimateTtsUsd([need.text]) > budget) {
      stop = `the budget of ${formatUsd(budget)} is reached`;
      return;
    }
    try {
      const fileKey = await make(need);
      ready.push({
        owner: need.owner,
        id: need.id,
        text: need.text,
        fileKey,
        voiceId: VOICE_ID,
        generatedAt: new Date().toISOString(),
      });
      if (ready.length >= 100) await flush();
    } catch (err) {
      if (isOutOfCredit(err)) {
        stop = "the OpenAI account is out of credit";
        return;
      }
      console.error(`${need.key} (${need.owner}): ${(err as Error).message.split("\n")[0]}`);
    }
    done += 1;
    if (done % 50 === 0) console.log(`${done}/${needs.length} made, about ${formatUsd(spent)}`);
  }
}

process.on("SIGINT", () => {
  stop = "stopped";
});
await Promise.all(Array.from({ length: 4 }, worker));
await flush();
rmSync(work, { recursive: true, force: true });

console.log(
  `\nAttached ${attached} recording(s) as drafts for review; about ${formatUsd(spent)} spent.` +
    (stale ? ` ${stale} skipped: the text changed meanwhile (made next run).` : ""),
);
if (stop) {
  console.log(`Stopped: ${stop}. Run the same command again to carry on.`);
  process.exit(stop === "stopped" ? 130 : 2);
}
