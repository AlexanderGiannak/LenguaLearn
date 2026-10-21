import type { z } from "zod";
import { isSameOrigin } from "@/lib/http/origin";
import { TrainingError } from "./service";

// Shared plumbing for the /api/train routes.

/**
 * The signed-in learner. Until accounts exist (Phase 4) this is one hard-coded dev user,
 * and only where ENABLE_DEV_USER=1 (local and CI). Production never sets it, so training
 * routes there answer 404. A `dev-user` cookie picks a separate dev user, so parallel
 * end-to-end tests do not share one session.
 */
export function trainingUserId(request?: Request): string | null {
  if (process.env.ENABLE_DEV_USER !== "1") return null;
  const cookie = request?.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)dev-user=([a-z0-9-]{1,40})(?:;|$)/.exec(cookie);
  return m ? `dev-${m[1]}` : "dev-user";
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Runs a training request: dev-user and origin checks, then the handler, mapping errors. */
export async function handleTraining(
  request: Request,
  handler: (userId: string, body: unknown) => Promise<unknown>,
): Promise<Response> {
  const userId = trainingUserId(request);
  if (!userId) return json({ error: "not found" }, 404);
  if (!isSameOrigin(request)) return json({ error: "cross-origin request refused" }, 403);
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 10_000) return json({ error: "body too large" }, 413);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: "body is not valid JSON" }, 400);
  }
  try {
    return json(await handler(userId, body));
  } catch (error) {
    if (error instanceof TrainingError) return json({ error: error.message }, error.status);
    if (error instanceof BadRequest)
      return json({ error: "invalid request", issues: error.issues }, 400);
    throw error;
  }
}

export class BadRequest extends Error {
  constructor(readonly issues: unknown) {
    super("invalid request");
  }
}

export function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequest(r.error.issues);
  return r.data;
}
