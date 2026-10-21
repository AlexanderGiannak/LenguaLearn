import { fixturesAllowed } from "@/lib/admin/auth";
import { denyAdminRequest, json, readJsonBody, zodIssues } from "@/lib/admin/route";
import { ImportError, importContent } from "@/lib/content/import";
import { importPayloadSchema } from "@/lib/content/import-schema";
import { getDb } from "@/lib/db/client";

// Content scripts upload JSON here (spec: Content pipeline). Rows load as draft or
// ai_checked only; reaching live takes the status endpoint and human review.

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;

  const body = await readJsonBody(request, MAX_BYTES);
  if (!body.ok) return body.response;

  const parsed = importPayloadSchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: zodIssues(parsed.error.issues) }, 400);
  }
  if (parsed.data.fixture && !fixturesAllowed(process.env)) {
    return json({ error: "fixture content is not allowed in this environment" }, 403);
  }

  try {
    return json(await importContent(getDb(), parsed.data));
  } catch (error) {
    if (error instanceof ImportError) {
      return json({ error: "import rejected", problems: error.problems }, 422);
    }
    throw error;
  }
}
