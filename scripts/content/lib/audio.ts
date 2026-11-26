// Content pipeline step 6: the pure parts of making recordings (spec: Content pipeline,
// step 6). The voice is OpenAI's marin for headwords and sentences (owner, 2026-11-25).
import { createHash } from "node:crypto";

export const TTS_MODEL = "gpt-4o-mini-tts";
export const TTS_VOICE = "marin";
export const TTS_INSTRUCTIONS =
  "Speak in neutral Latin American Spanish, as a friendly teacher would for learners: clear, " +
  "natural and at a moderate pace. Do not add anything to the text.";
/** Stored with every recording, so a later voice change can find the old ones. */
export const VOICE_ID = `openai/${TTS_MODEL}/${TTS_VOICE}`;

/** Speech loudness for the web: -16 LUFS integrated, true peak at most -1.5 dBTP. */
export const LOUDNESS = { integrated: -16, truePeak: -1.5 } as const;

/**
 * The media path of a recording. It is a hash of everything that shapes the sound, so the
 * same text in the same voice is made once, and a changed text, voice or a deliberate
 * remake (`take`) gets a new path: CloudFront caches each path forever.
 */
export function audioFileKey(text: string, take?: string): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify([VOICE_ID, TTS_INSTRUCTIONS, LOUDNESS, text.normalize("NFC"), take ?? ""]),
    )
    .digest("hex")
    .slice(0, 24);
  return `audio/${hash}.mp3`;
}

// gpt-4o-mini-tts costs about $0.015 per minute of audio (OpenAI pricing, 2026-11). A
// learner-paced Spanish voice says about 12 characters a second, plus a short pause.
const USD_PER_MINUTE = 0.015;
const CHARS_PER_SECOND = 12;
const SECONDS_PER_CLIP = 0.6;

/** A generous estimate of what making these recordings costs, in US dollars. */
export function estimateTtsUsd(texts: string[]): number {
  const seconds = texts.reduce((n, t) => n + t.length / CHARS_PER_SECOND + SECONDS_PER_CLIP, 0);
  return (seconds / 60) * USD_PER_MINUTE;
}

export type Loudness = { integrated: number; truePeak: number };

/** Reads ffmpeg's loudnorm measurement (print_format=json, printed last on stderr). */
export function parseLoudnorm(stderr: string): Loudness {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("ffmpeg printed no loudness measurement");
  const m = JSON.parse(stderr.slice(start, end + 1)) as { input_i?: string; input_tp?: string };
  const integrated = Number(m.input_i);
  const truePeak = Number(m.input_tp);
  if (!Number.isFinite(integrated) || !Number.isFinite(truePeak)) {
    throw new Error(`the recording is silent or unreadable (${m.input_i}, ${m.input_tp})`);
  }
  return { integrated, truePeak };
}

/**
 * The gain that brings a recording to the target loudness without its peaks going over
 * the ceiling. One fixed gain for the whole clip (no compression), so short headwords and
 * long sentences sound alike and keep their natural dynamics.
 */
export function gainDb(measured: Loudness, target: Loudness = LOUDNESS): number {
  const gain = Math.min(
    target.integrated - measured.integrated,
    target.truePeak - measured.truePeak,
  );
  return Math.round(gain * 100) / 100;
}
