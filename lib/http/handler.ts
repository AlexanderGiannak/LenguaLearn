import type { z } from "zod";
import { AccountError } from "@/lib/auth/accounts";
import { AuthError, currentUser, requireUser, type CurrentUser } from "@/lib/auth/session";
import type { Role } from "@/lib/db/schema";
import { NotFound } from "@/lib/teacher/scope";
import { isSameOrigin } from "./origin";

// One wrapper for the app's browser-facing API routes. It applies the spec's checks in one
// place: the Origin check on every state-changing request, the role check, a size cap and
// Zod validation of the body, and turns known errors into plain-language JSON responses.

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export class BadRequest extends Error {
  constructor(readonly issues: unknown) {
    super("invalid request");
  }
}

/** Errors other modules throw with an HTTP status attached. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequest(r.error.issues);
  return r.data;
}

type Ctx<U> = {
  user: U;
  body: unknown;
  request: Request;
  /** A Set-Cookie value for the response, whether the handler succeeds or fails. */
  setCookie: (cookie: string) => void;
};

export async function handle(
  request: Request,
  opts: { roles: readonly Role[] },
  fn: (ctx: Ctx<CurrentUser>) => Promise<unknown>,
): Promise<Response>;
export async function handle(
  request: Request,
  opts: { roles: "public" },
  fn: (ctx: Ctx<CurrentUser | null>) => Promise<unknown>,
): Promise<Response>;
export async function handle(
  request: Request,
  opts: { roles: readonly Role[] | "public" },
  fn: (ctx: Ctx<CurrentUser>) => Promise<unknown>,
): Promise<Response> {
  const cookies: string[] = [];
  const send = (res: Response) => {
    for (const c of cookies) res.headers.append("Set-Cookie", c);
    return res;
  };
  try {
    const changesState = request.method !== "GET" && request.method !== "HEAD";
    if (changesState && !isSameOrigin(request)) {
      return json({ error: "cross-origin request refused" }, 403);
    }
    // For public routes the user may be null; the overloads above give callers that type.
    const user = (
      opts.roles === "public"
        ? await currentUser(request.headers)
        : await requireUser(request.headers, opts.roles)
    ) as CurrentUser;

    let body: unknown = {};
    if (changesState) {
      const raw = await request.text();
      if (raw.length > 20_000) return json({ error: "body too large" }, 413);
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return json({ error: "body is not valid JSON" }, 400);
      }
    }

    const result = await fn({ user, body, request, setCookie: (c) => cookies.push(c) });
    return send(result instanceof Response ? result : json(result));
  } catch (error) {
    if (error instanceof BadRequest)
      return send(json({ error: "invalid request", issues: error.issues }, 400));
    if (error instanceof AuthError || error instanceof AccountError || error instanceof HttpError) {
      return send(json({ error: error.message }, error.status));
    }
    if (error instanceof NotFound) return send(json({ error: "not found" }, 404));
    if (error && typeof error === "object" && "status" in error && "message" in error) {
      const status = Number((error as { status: unknown }).status);
      if (status >= 400 && status < 500) {
        return send(json({ error: String((error as { message: unknown }).message) }, status));
      }
    }
    throw error;
  }
}

/** Copies Better Auth's Set-Cookie headers onto our JSON reply, plus a device cookie. */
export function withCookies(
  from: Response | null,
  body: unknown,
  extraCookie?: string | null,
): Response {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
  for (const c of from?.headers.getSetCookie() ?? []) headers.append("Set-Cookie", c);
  if (extraCookie) headers.append("Set-Cookie", extraCookie);
  return new Response(JSON.stringify(body), { status: 200, headers });
}
