import { RateLimiter, type Verdict } from "./rate-limit";

// Login and seat-code limits (spec: Security requirements). School devices share one public
// IP, so limits key on the handle or seat code and on the device cookie; the IP only gets a
// high ceiling. No browser fingerprinting.

const WINDOW_MS = 15 * 60_000;
export const AUTH_LIMITS = {
  /** Attempts at one handle, username or email. */
  perAccount: 10,
  /** Attempts at one seat code. */
  perSeatCode: 10,
  /** Failed attempts from one device cookie. */
  deviceFailures: 30,
  /** All attempts from one IP: a ceiling, not the main control. */
  ipCeiling: 300,
} as const;

type Who = { device: string; ip: string };

export class AuthLimits {
  constructor(private readonly rl = new RateLimiter()) {}

  private check(primary: string, primaryLimit: number, who: Who): Verdict {
    // Check everything before counting anything, so a refused attempt costs nothing.
    const verdicts = [
      this.rl.check(primary, primaryLimit, WINDOW_MS),
      this.rl.check(`device-fail:${who.device}`, AUTH_LIMITS.deviceFailures, WINDOW_MS),
      this.rl.check(`ip:${who.ip}`, AUTH_LIMITS.ipCeiling, WINDOW_MS),
    ];
    const refused = verdicts.filter((v) => !v.allowed);
    if (refused.length > 0) {
      return { allowed: false, retryAfterMs: Math.max(...refused.map((v) => v.retryAfterMs)) };
    }
    this.rl.record(primary, WINDOW_MS);
    this.rl.record(`ip:${who.ip}`, WINDOW_MS);
    return { allowed: true, retryAfterMs: 0 };
  }

  checkLogin(who: Who & { account: string }): Verdict {
    return this.check(`account:${who.account.toLowerCase()}`, AUTH_LIMITS.perAccount, who);
  }

  recordLoginFailure(who: Who): void {
    this.rl.record(`device-fail:${who.device}`, WINDOW_MS);
  }

  checkRedemption(who: Who & { code: string }): Verdict {
    return this.check(`code:${who.code}`, AUTH_LIMITS.perSeatCode, who);
  }

  recordRedemptionFailure(who: Who): void {
    this.rl.record(`device-fail:${who.device}`, WINDOW_MS);
  }

  sweep(): void {
    this.rl.sweep(WINDOW_MS);
  }
}

// One set of limits per server process (the spec's single server).
const g = globalThis as unknown as { authLimits?: AuthLimits };
export function authLimits(): AuthLimits {
  if (!g.authLimits) {
    g.authLimits = new AuthLimits();
    setInterval(() => g.authLimits?.sweep(), 60_000).unref();
  }
  return g.authLimits;
}
