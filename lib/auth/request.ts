import { authBaseUrl, authSecret } from "./auth";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  newDeviceCookie,
  verifyDeviceCookie,
} from "./device";

// What the rate limiter needs from a request. The IP is read here and used in memory only.

export type RequestContext = {
  device: string;
  ip: string;
  /** A fresh device cookie to set on the response, if the request had none. */
  setDeviceCookie: string | null;
};

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function requestContext(request: Request): RequestContext {
  const secret = authSecret();
  const existing = verifyDeviceCookie(
    readCookie(request.headers.get("cookie"), DEVICE_COOKIE),
    secret,
  );
  let device = existing;
  let setDeviceCookie: string | null = null;
  if (!device) {
    const cookie = newDeviceCookie(secret);
    device = cookie.split(".")[0]!;
    setDeviceCookie = cookie;
  }
  // Railway's proxy puts the client address first in X-Forwarded-For.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return { device, ip, setDeviceCookie };
}

export function deviceCookieHeader(value: string): string {
  const secure = authBaseUrl().startsWith("https://") ? "; Secure" : "";
  return `${DEVICE_COOKIE}=${value}; Path=/; Max-Age=${DEVICE_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`;
}
