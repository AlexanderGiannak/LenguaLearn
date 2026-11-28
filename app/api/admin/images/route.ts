import { z } from "zod";
import { denyAdminRequest, json, readJsonBody, zodIssues } from "@/lib/admin/route";
import { attachImages, attachImagesSchema, imageNeeds } from "@/lib/content/images";
import { getDb } from "@/lib/db/client";

// The image script (npm run content:images) asks here which senses need a picture and
// attaches what it found or made. Content only: nothing about learners is read or returned.

const MAX_BYTES = 512 * 1024;

const querySchema = z.strictObject({
  lemma: z.string().min(1).max(120).optional(),
});

export async function GET(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return json({ error: "invalid query", issues: zodIssues(parsed.error.issues) }, 400);
  }
  return json({ needs: await imageNeeds(getDb(), { lemmaKey: parsed.data.lemma }) });
}

export async function POST(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;
  const body = await readJsonBody(request, MAX_BYTES);
  if (!body.ok) return body.response;
  const parsed = attachImagesSchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: zodIssues(parsed.error.issues) }, 400);
  }
  return json(await attachImages(getDb(), parsed.data));
}
