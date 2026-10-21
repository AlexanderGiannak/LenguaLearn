import { isBrowserRequest, verifyAdminToken } from "./auth";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Returns an error response if the request may not use the admin API, otherwise null. */
export function denyAdminRequest(request: Request): Response | null {
  if (isBrowserRequest(request)) {
    return json({ error: "the admin API does not accept browser requests" }, 403);
  }
  if (!verifyAdminToken(request.headers.get("authorization"), process.env.ADMIN_API_TOKEN_HASH)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

/** Reads a JSON body, refusing anything over maxBytes before parsing it. */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const tooLarge = () => ({
    ok: false as const,
    response: json({ error: `body is larger than ${maxBytes} bytes` }, 413),
  });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return tooLarge();

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return tooLarge();
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, response: json({ error: "body is not valid JSON" }, 400) };
  }
}

export function zodIssues(issues: { path: PropertyKey[]; message: string }[]) {
  // Capped so a badly broken file does not produce a megabyte of errors.
  return issues.slice(0, 200).map((i) => ({ path: i.path.join("."), message: i.message }));
}
