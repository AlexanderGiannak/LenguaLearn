import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The device cookie (spec: What the app stores): a random signed ID kept 90 days, used only
// to count failed logins per device. It identifies a browser, not a person, and is never
// stored on the server.

export const DEVICE_COOKIE = "ll_device";
export const DEVICE_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

export function newDeviceCookie(secret: string): string {
  const id = randomBytes(16).toString("base64url");
  return `${id}.${sign(id, secret)}`;
}

/** The device ID if the cookie is genuine, otherwise null. */
export function verifyDeviceCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null;
  const [id, mac] = value.split(".");
  if (!id || !mac) return null;
  const expected = Buffer.from(sign(id, secret));
  const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null;
}
