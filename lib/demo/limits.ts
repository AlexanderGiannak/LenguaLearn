import { RateLimiter } from "@/lib/auth/rate-limit";
import { DEMO_CONFIG } from "./config";

// Caps on the demo site's "Try it" buttons, in memory like the sign-in limits: per browser
// (device cookie) across both buttons, and site-wide per button.

const HOUR = 3_600_000;

export type DemoVerdict =
  { ok: true } | { ok: false; reason: "device" | "site"; retryAfterMs: number };

export class DemoLimits {
  private readonly limiter: RateLimiter;

  constructor(
    now: () => number = Date.now,
    private readonly limits: {
      perDevice: number;
      learnersSiteWide: number;
      teachersSiteWide: number;
    } = DEMO_CONFIG.limits,
  ) {
    this.limiter = new RateLimiter(now);
  }

  /**
   * Whether this browser may start a demo now. Counts the start when it may. A refusal says
   * which cap was hit, so the visitor is told the truth: their own browser's cap is not
   * "the demo is busy".
   */
  allow(role: "learner" | "teacher", device: string): DemoVerdict {
    const siteWide =
      role === "teacher" ? this.limits.teachersSiteWide : this.limits.learnersSiteWide;
    const deviceKey = `device:${device}`;
    const siteKey = `site:${role}`;
    const byDevice = this.limiter.check(deviceKey, this.limits.perDevice, HOUR);
    if (!byDevice.allowed) {
      return { ok: false, reason: "device", retryAfterMs: byDevice.retryAfterMs };
    }
    const bySite = this.limiter.check(siteKey, siteWide, HOUR);
    if (!bySite.allowed) return { ok: false, reason: "site", retryAfterMs: bySite.retryAfterMs };
    this.limiter.record(deviceKey, HOUR);
    this.limiter.record(siteKey, HOUR);
    return { ok: true };
  }
}
