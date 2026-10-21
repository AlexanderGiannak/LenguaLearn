import { z } from "zod";
import { denyAdminRequest, json, readJsonBody, zodIssues } from "@/lib/admin/route";
import { CONTENT_STATUSES } from "@/lib/content/constants";
import { CONTENT_TABLE_NAMES } from "@/lib/content/import";
import { applyStatusChanges, StatusChangeError } from "@/lib/content/status-changes";
import { getDb } from "@/lib/db/client";

// Moves content rows through the status flow (see lib/content/status.ts). Until the
// Phase 9 review tool exists, this is how the owner approves and publishes content.

const MAX_BYTES = 1024 * 1024;

const bodySchema = z.strictObject({
  changes: z
    .array(
      z.strictObject({
        table: z.enum(CONTENT_TABLE_NAMES),
        id: z.int().positive(),
        to: z.enum(CONTENT_STATUSES),
      }),
    )
    .min(1)
    .max(5000),
});

export async function POST(request: Request) {
  const denied = denyAdminRequest(request);
  if (denied) return denied;

  const body = await readJsonBody(request, MAX_BYTES);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid payload", issues: zodIssues(parsed.error.issues) }, 400);
  }

  try {
    return json({ applied: await applyStatusChanges(getDb(), parsed.data.changes) });
  } catch (error) {
    if (error instanceof StatusChangeError) {
      return json({ error: "status change rejected", problems: error.problems }, 409);
    }
    throw error;
  }
}
