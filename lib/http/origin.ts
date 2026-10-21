// Origin check for state-changing browser requests (spec: Security requirements). Browsers
// always send Origin on POST, so a missing or foreign Origin is refused. Behind Railway's
// proxy the public host arrives in X-Forwarded-Host.

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host !== null && originHost === host.split(",")[0]!.trim();
}
