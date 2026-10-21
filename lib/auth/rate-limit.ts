// In-memory sliding-window rate limiter (spec: Security requirements). One server means
// in-memory limits stay valid ("One Railway server" in the spec). Keys hold handles, seat
// codes, device IDs and IP addresses; none of it is written anywhere.

export type Verdict = { allowed: boolean; retryAfterMs: number };

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  private recent(key: string, windowMs: number): number[] {
    const cutoff = this.now() - windowMs;
    const kept = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  /** Whether one more attempt fits, without counting it. */
  check(key: string, limit: number, windowMs: number): Verdict {
    const recent = this.recent(key, windowMs);
    if (recent.length < limit) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: recent[0]! + windowMs - this.now() };
  }

  /** Counts an attempt. */
  record(key: string, windowMs: number): void {
    this.hits.set(key, [...this.recent(key, windowMs), this.now()]);
  }

  /** Checks and, if allowed, counts. */
  hit(key: string, limit: number, windowMs: number): Verdict {
    const verdict = this.check(key, limit, windowMs);
    if (verdict.allowed) this.record(key, windowMs);
    return verdict;
  }

  /** Drops keys whose attempts are all older than the longest window. */
  sweep(maxWindowMs = 15 * 60_000): void {
    for (const key of [...this.hits.keys()]) this.recent(key, maxWindowMs);
  }

  get size(): number {
    return this.hits.size;
  }
}
