import { z } from "zod";
import { denyAdminRequest, json, readJsonBody, zodIssues } from "@/lib/admin/route";
import { attachAudio, attachAudioSchema, audioNeeds } from "@/lib/content/audio";
import { getDb } from "@/lib/db/client";

// The audio script (npm run content:audio) asks here what needs a recording and attaches
// what it made. Content text only: nothing about learners is read or returned.

const MAX_BYTES = 512 * 1024;

const querySchema = z.strictObject({
  lemma: z.string().min(1).max(120).optional(),
  all: z.enum(["1"]).optional(),
});

export async function GET(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return json({ error: "invalid query", issues: zodIssues(parsed.error.issues) }, 400);
  }
  const needs = await audioNeeds(getDb(), {
    lemmaKey: parsed.data.lemma,
    all: parsed.data.all === "1",
  });
  return json({ needs });
}

export async function POST(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;
  const body = await readJsonBody(request, MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = attachAudioSchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: zodIssues(parsed.error.issues) }, 400);
  }
  return json(await attachAudio(getDb(), parsed.data));
}
