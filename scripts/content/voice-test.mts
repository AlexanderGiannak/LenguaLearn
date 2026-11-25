// Content pipeline step 6, before any audio is made: the same headwords and sentences in
// each candidate voice, so the owner can pick one voice for headwords and one for sentences.
//
//   npm run content:voice-test        # then open content/voice-test/index.html
//
// Polly runs through the AWS CLI (profile lengualearn, us-east-2), OpenAI through its API.
// The text comes from generated content (content/generated/); never student data.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { GeneratedFile } from "./lib/generated.ts";

type Voice = { id: string; label: string; make: (text: string, out: string) => Promise<void> };

const OPENAI_INSTRUCTIONS =
  "Speak in neutral Latin American Spanish, as a friendly teacher would for learners: clear, " +
  "natural and at a moderate pace. Do not add anything to the text.";

const polly =
  (voiceId: string): Voice["make"] =>
  async (text, out) => {
    execFileSync(
      "aws",
      [
        "polly",
        "synthesize-speech",
        "--region",
        "us-east-2",
        "--engine",
        "standard",
        "--voice-id",
        voiceId,
        "--output-format",
        "mp3",
        "--text",
        text,
        fileURLToPath(out),
      ],
      { env: { ...process.env, AWS_PROFILE: process.env.AWS_PROFILE ?? "lengualearn" } },
    );
  };

let client: OpenAI | null = null;
const openai =
  (voice: string): Voice["make"] =>
  async (text, out) => {
    client ??= new OpenAI();
    const res = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions: OPENAI_INSTRUCTIONS,
      response_format: "mp3",
    });
    writeFileSync(new URL(out), Buffer.from(await res.arrayBuffer()));
  };

const VOICES: Voice[] = [
  { id: "polly-lupe", label: "Polly Lupe (US Spanish, female)", make: polly("Lupe") },
  { id: "polly-penelope", label: "Polly Penélope (US Spanish, female)", make: polly("Penelope") },
  { id: "polly-miguel", label: "Polly Miguel (US Spanish, male)", make: polly("Miguel") },
  { id: "polly-mia", label: "Polly Mia (Mexican Spanish, female)", make: polly("Mia") },
  { id: "openai-marin", label: "OpenAI marin (female)", make: openai("marin") },
  { id: "openai-cedar", label: "OpenAI cedar (male)", make: openai("cedar") },
];

const root = new URL("../../content/", import.meta.url);
const outDir = new URL("voice-test/", root);
mkdirSync(outDir, { recursive: true });

// Five headwords and ten sentences, spread across the generated words.
const files = readdirSync(new URL("generated/", root))
  .filter((n) => n.endsWith(".json") && !/ \d+\.json$/.test(n))
  .map((n) => JSON.parse(readFileSync(new URL(`generated/${n}`, root), "utf8")) as GeneratedFile)
  .filter((f) => f.output.lemmas.length > 0)
  .sort((a, b) => a.candidate.rank - b.candidate.rank);
if (files.length < 10) throw new Error("Generate at least 10 words first (content:generate).");
const pick = <T,>(xs: T[], n: number) =>
  Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]!);
const headwords = pick(files, 5).map((f) => f.output.lemmas[0]!.headword);
const sentences = pick(files, 10).map(
  (f, i) => f.output.lemmas[0]!.senses[0]!.examples[i % 4]!.text,
);
const items = [
  ...headwords.map((text, i) => ({ id: `h${i + 1}`, kind: "Headword", text })),
  ...sentences.map((text, i) => ({ id: `s${i + 1}`, kind: "Sentence", text })),
];

for (const v of VOICES) {
  const dir = new URL(`${v.id}/`, outDir);
  mkdirSync(dir, { recursive: true });
  for (const item of items) {
    const out = new URL(`${item.id}.mp3`, dir);
    if (existsSync(out)) continue;
    try {
      await v.make(item.text, out.href);
    } catch (err) {
      console.error(`${v.id} ${item.id}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  console.log(`${v.label}: done`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voice test</title>
<style>
  :root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fff; --line: #ddd; }
  @media (prefers-color-scheme: dark) { :root { --fg: #eee; --bg: #161618; --line: #333; } }
  body { font: 15px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0; padding: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: middle; }
  th { position: sticky; top: 0; background: var(--bg); font-size: 13px; }
  audio { width: 150px; height: 32px; }
  .kind { font-size: 12px; opacity: .7; }
  .wrap { overflow-x: auto; }
</style></head><body>
<h1>Voice test</h1>
<p>The same headwords and sentences in each voice. Pick one voice for headwords and one for sentences (the spec asks for two different Latin American voices). Not loudness-normalized yet.</p>
<div class="wrap"><table><thead><tr><th>Text</th>${VOICES.map((v) => `<th>${esc(v.label)}</th>`).join("")}</tr></thead><tbody>
${items
  .map(
    (item) =>
      `<tr><td><span class="kind">${item.kind}</span><br><span lang="es">${esc(item.text)}</span></td>${VOICES.map(
        (v) => `<td><audio controls preload="none" src="${v.id}/${item.id}.mp3"></audio></td>`,
      ).join("")}</tr>`,
  )
  .join("\n")}
</tbody></table></div></body></html>
`;
writeFileSync(new URL("index.html", outDir), html);
console.log(`Open ${fileURLToPath(new URL("index.html", outDir))}`);
