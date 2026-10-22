import { RateLimiter } from "@/lib/auth/rate-limit";
import { DEMO_CONFIG } from "./config";

// Caps on the demo site's "Try it" buttons, in memory like the sign-in limits: per browser
// (device cookie) across both buttons, and site-wide per button.

const HOUR = 3_600_000;

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

  /** Whether this browser may start a demo now. Counts the start when it may. */
  allow(role: "learner" | "teacher", device: string): boolean {
    const siteWide =
      role === "teacher" ? this.limits.teachersSiteWide : this.limits.learnersSiteWide;
    const deviceKey = `device:${device}`;
    const siteKey = `site:${role}`;
    if (
      !this.limiter.check(deviceKey, this.limits.perDevice, HOUR).allowed ||
      !this.limiter.check(siteKey, siteWide, HOUR).allowed
    ) {
      return false;
    }
    this.limiter.record(deviceKey, HOUR);
    this.limiter.record(siteKey, HOUR);
    return true;
  }
}
