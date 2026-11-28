// Content pipeline step 7: a picture for every concrete sense.
//
//   npm run content:images                                  # what's missing and what it costs
//   npm run content:images -- --yes                         # find or make them for the local app
//   npm run content:images -- https://lengualearn.com --yes # for the real site (S3 bucket)
//   npm run content:images -- --word perro#noun --yes       # one word only
//
// The app says which concrete senses need a picture. For each, Openverse (openly licensed
// pictures from Wikimedia Commons, Flickr and others; CC0, public domain, CC BY and CC BY-SA
// only) is searched for the English meaning, and an OpenAI model looks at up to six results
// and picks the one that shows the meaning with no text in it, or none. With none,
// gpt-image-2 makes one and the same model checks it. ffmpeg shrinks the picture to a JPEG,
// which goes to public/images/ for the local app or to the media bucket (MEDIA_BUCKET) for
// a deployed one. The app attaches it as a draft with its source, license and credit, and a
// reviewer approves or rejects it. Only content (meanings and picture descriptions) is sent
// to Openverse and OpenAI, never student data.
//
// What was chosen is kept in content/images/, so a stopped run (Ctrl-C, out of credit, the
// budget, Openverse's daily limit) resumes without paying twice: run the same command again.
import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  CANDIDATES_PER_SENSE,
  chosenIndex,
  estimateImagesUsd,
  GENERATED,
  generatedUsd,
  generationPrompt,
  IMAGE_MODEL,
  IMAGE_QUALITY,
  imageFileKey,
  MAX_SIDE,
  OPENVERSE_LICENSES,
  PICK_EFFORT,
  PICK_INSTRUCTIONS,
  PICK_MODEL,
  pickPrompt,
  pickSchema,
  searchQuery,
  toCandidate,
  USD_PER_GENERATED,
  USD_PER_PICK,
  type Candidate,
  type OpenverseImage,
} from "./lib/images.ts";
import { costUsd, formatUsd, isOutOfCredit, openAiUsage } from "./lib/run.ts";

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
const budget = Number(flag("--budget") ?? "5");
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
  console.error("MEDIA_BUCKET is not set: a deployed site's pictures go to the media bucket.");
  process.exit(1);
}

type Need = {
  senseId: number;
  key: string;
  headword: string;
  gloss: string;
  imageDescription: string;
  rejected: string[];
  rejectedReason: string | null;
};
type Picture = {
  fileKey: string;
  alt: string;
  source: string;
  license: string;
  attribution: string;
};
type Saved = { imageDescription: string; picture: Picture | null; reason?: string };

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(`${path}: ${res.status} ${body.error ?? ""}`);
  return body;
}

const query = word ? `?lemma=${encodeURIComponent(word)}` : "";
const { needs: all } = (await api(`/api/admin/images${query}`)) as { needs: Need[] };
const needs = all.slice(0, limit);
const estimate = estimateImagesUsd(needs.length);
console.log(
  `${needs.length} concrete sense(s) need a picture on ${baseUrl}` +
    `${all.length > needs.length ? ` (of ${all.length}; --limit)` : ""}. ` +
    `About ${formatUsd(estimate.typical)} of OpenAI credit, at most ${formatUsd(estimate.most)}` +
    ` (budget ${formatUsd(budget)}).`,
);
if (needs.length === 0) process.exit(0);
if (!yes) {
  console.log(
    local
      ? "Add --yes to find or make them."
      : `Add --yes to find or make them and upload them to s3://${bucket}/ for ${baseUrl}.`,
  );
  process.exit(0);
}

for (const tool of ["ffmpeg", ...(local ? [] : ["aws"])]) {
  try {
    await run(tool, [tool === "aws" ? "--version" : "-version"]);
  } catch {
    console.error(`${tool} is not installed (brew install ${tool === "aws" ? "awscli" : tool}).`);
    process.exit(1);
  }
}

const root = new URL("../../", import.meta.url);
const cacheDir = fileURLToPath(new URL("content/images/", root));
const publicDir = fileURLToPath(new URL("public/", root));
mkdirSync(join(cacheDir, "images"), { recursive: true });
mkdirSync(join(cacheDir, "chosen"), { recursive: true });
const work = mkdtempSync(join(tmpdir(), "lengualearn-images-"));

const client = new OpenAI();
// A generic client name: no personal or project details go to the picture hosts.
const USER_AGENT = "content-image-script/1.0";
let spent = 0;
let stop: string | null = null;
let attached = 0;
let stale = 0;
let none = 0;
const ready: (Picture & { senseId: number; imageDescription: string })[] = [];

const savedPath = (need: Need) =>
  join(cacheDir, "chosen", `${need.key.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.json`);

/** Shrinks any picture ffmpeg can read to a JPEG at most `side` pixels on its longest side. */
async function toJpeg(input: string, output: string, side: number) {
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    "-vf",
    `scale='min(${side},iw)':'min(${side},ih)':force_original_aspect_ratio=decrease`,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    output,
  ]);
}

let lastSearch = 0;
/** Openverse allows about 20 anonymous searches a minute: one every 3.5 seconds. */
async function search(q: string): Promise<OpenverseImage[]> {
  const wait = lastSearch + 3500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();
  const params = new URLSearchParams({
    q,
    license: OPENVERSE_LICENSES.join(","),
    mature: "false",
    page_size: "20",
  });
  const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 429) throw new Error("openverse-limit");
  if (!res.ok) throw new Error(`Openverse search: ${res.status}`);
  return ((await res.json()) as { results: OpenverseImage[] }).results;
}

/** Downloads a library picture (at most 20 MB) into the work folder; null if it fails. */
async function download(url: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    const size = Number(res.headers.get("content-length") ?? "0");
    if (!res.ok || size > 20_000_000) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 20_000_000) return null;
    const path = join(work, name);
    writeFileSync(path, bytes);
    return path;
  } catch {
    return null;
  }
}

/** Shows the pictures (JPEG files) to the picker; returns its answer. */
async function pick(need: Need, files: string[]) {
  const res = await client.responses.parse({
    model: PICK_MODEL,
    instructions: PICK_INSTRUCTIONS,
    reasoning: { effort: PICK_EFFORT },
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: pickPrompt(need, files.length, need.rejectedReason) },
          ...files.map((f) => ({
            type: "input_image" as const,
            image_url: `data:image/jpeg;base64,${readFileSync(f).toString("base64")}`,
            detail: "low" as const,
          })),
        ],
      },
    ],
    text: { format: zodTextFormat(pickSchema, "picture_pick") },
  });
  spent += res.usage ? costUsd(PICK_MODEL, openAiUsage(res.usage), false) : USD_PER_PICK;
  if (!res.output_parsed) throw new Error("the picker gave no answer");
  return res.output_parsed;
}

/** Stores a finished JPEG under its hash, then copies or uploads it. */
async function publish(jpeg: string): Promise<string> {
  const bytes = readFileSync(jpeg);
  const fileKey = imageFileKey(bytes);
  const cached = join(cacheDir, fileKey);
  if (!existsSync(cached)) copyFileSync(jpeg, cached);
  if (local) {
    mkdirSync(join(publicDir, "images"), { recursive: true });
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
        "image/jpeg",
        "--cache-control",
        "public, max-age=31536000, immutable",
        "--only-show-errors",
      ],
      { env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE ?? "lengualearn" } },
    );
  }
  return fileKey;
}

/** The library first; a generated picture when nothing there fits. Null if neither works. */
async function choose(need: Need, n: number): Promise<{ picture: Picture | null; reason: string }> {
  const rejected = new Set(need.rejected);
  const results = await search(searchQuery(need.gloss));
  const candidates: { c: Candidate; original: string; small: string }[] = [];
  for (const r of results) {
    if (candidates.length >= CANDIDATES_PER_SENSE) break;
    const c = toCandidate(r, rejected);
    if (!c) continue;
    const original = await download(c.url, `${n}-${candidates.length}`);
    if (!original) continue;
    const small = join(work, `${n}-${candidates.length}-small.jpg`);
    try {
      await toJpeg(original, small, 512);
      candidates.push({ c, original, small });
    } catch {
      // Not a picture ffmpeg can read (an SVG, a broken file): skip it.
    }
  }

  let reason = "the library had no pictures for this meaning";
  if (candidates.length > 0) {
    const p = await pick(
      need,
      candidates.map((x) => x.small),
    );
    const i = chosenIndex(p, candidates.length);
    if (i !== null) {
      const chosen = candidates[i]!;
      const final = join(work, `${n}-final.jpg`);
      await toJpeg(chosen.original, final, MAX_SIDE);
      const { source, license, attribution } = chosen.c;
      const fileKey = await publish(final);
      return {
        picture: { fileKey, alt: p.alt.trim(), source, license, attribution },
        reason: p.reason,
      };
    }
    reason = p.reason;
  }

  // Nothing suitable: make one, check it the same way, and try once more if it fails.
  let note = need.rejectedReason;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (spent + USD_PER_GENERATED + USD_PER_PICK > budget) {
      stop = `the budget of ${formatUsd(budget)} is reached`;
      return { picture: null, reason: "budget" };
    }
    const res = await client.images.generate({
      model: IMAGE_MODEL,
      prompt: generationPrompt(need, note),
      size: "1024x1024",
      quality: IMAGE_QUALITY,
      output_format: "jpeg",
      n: 1,
    });
    spent += generatedUsd(res.usage);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no picture came back");
    const made = join(work, `${n}-made-${attempt}.jpg`);
    writeFileSync(made, Buffer.from(b64, "base64"));
    const small = join(work, `${n}-made-${attempt}-small.jpg`);
    await toJpeg(made, small, 512);
    const p = await pick(need, [small]);
    if (chosenIndex(p, 1) === 0) {
      const final = join(work, `${n}-final.jpg`);
      await toJpeg(made, final, MAX_SIDE);
      return {
        picture: { fileKey: await publish(final), alt: p.alt.trim(), ...GENERATED },
        reason: p.reason,
      };
    }
    reason = p.reason;
    note = p.reason;
  }
  return { picture: null, reason };
}

async function flush() {
  while (ready.length > 0) {
    const items = ready.splice(0, 50);
    const r = (await api("/api/admin/images", {
      method: "POST",
      body: JSON.stringify({ items }),
    })) as { attached: number; unchanged: number; stale: unknown[] };
    attached += r.attached + r.unchanged;
    stale += r.stale.length;
  }
}

process.on("SIGINT", () => {
  stop = "stopped";
});

// One at a time: Openverse's anonymous limit sets the pace anyway.
for (const [n, need] of needs.entries()) {
  if (stop) break;
  if (spent + USD_PER_PICK > budget) {
    stop = `the budget of ${formatUsd(budget)} is reached`;
    break;
  }
  const path = savedPath(need);
  let saved: Saved | null = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Saved)
    : null;
  // A saved choice counts only for the same description and if no reviewer rejected it.
  if (
    saved &&
    (saved.imageDescription !== need.imageDescription ||
      (saved.picture && need.rejected.includes(saved.picture.source)) ||
      (saved.picture === null && need.rejectedReason !== null))
  ) {
    saved = null;
  }
  try {
    if (!saved) {
      const { picture, reason } = await choose(need, n);
      if (stop && !picture) break;
      saved = { imageDescription: need.imageDescription, picture, reason };
      writeFileSync(path, JSON.stringify(saved, null, 2) + "\n");
    } else if (saved.picture) {
      // Uploaded again in case this is another site, or the local copy was cleaned.
      const cached = join(cacheDir, saved.picture.fileKey);
      if (existsSync(cached)) await publish(cached);
      else {
        saved = null;
        rmSync(path);
        continue;
      }
    }
    if (saved.picture) {
      ready.push({
        senseId: need.senseId,
        imageDescription: need.imageDescription,
        ...saved.picture,
      });
      if (ready.length >= 50) await flush();
    } else {
      none += 1;
      console.log(`${need.key}: no suitable picture (${saved.reason ?? "none"}).`);
    }
  } catch (err) {
    if (isOutOfCredit(err)) {
      stop = "the OpenAI account is out of credit";
      break;
    }
    if ((err as Error).message === "openverse-limit") {
      stop =
        "Openverse's limit for anonymous searches is reached (try again in an hour or tomorrow)";
      break;
    }
    console.error(`${need.key}: ${(err as Error).message.split("\n")[0]}`);
  }
  if ((n + 1) % 10 === 0) console.log(`${n + 1}/${needs.length} done, about ${formatUsd(spent)}`);
}
await flush();
rmSync(work, { recursive: true, force: true });

console.log(
  `\nAttached ${attached} picture(s) as drafts for review; about ${formatUsd(spent)} spent.` +
    (none ? ` ${none} sense(s) have no suitable picture and go live without one.` : "") +
    (stale ? ` ${stale} skipped: the sense changed meanwhile (asked again next run).` : ""),
);
if (stop) {
  console.log(`Stopped: ${stop}. Run the same command again to carry on.`);
  process.exit(stop === "stopped" ? 130 : 2);
}
