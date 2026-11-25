import { describe, expect, it } from "vitest";
import { costUsd, estimateRunUsd, isOutOfCredit, measureUsage, openAiUsage } from "./run.ts";

describe("costUsd", () => {
  it("prices input, output and cache tokens, and halves batch requests", () => {
    const usage = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    };
    expect(costUsd("claude-opus-5-5", usage, false)).toBeCloseTo(4 + 20 + 0.2 + 5);
    expect(costUsd("claude-opus-5-5", usage, true)).toBeCloseTo((4 + 20 + 0.2 + 5) / 2);
  });
});

describe("openAiUsage", () => {
  it("separates cached tokens, which OpenAI counts inside input_tokens", () => {
    const usage = openAiUsage({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      input_tokens_details: { cached_tokens: 400_000 },
    });
    expect(usage).toEqual({
      input_tokens: 600_000,
      cache_read_input_tokens: 400_000,
      output_tokens: 1_000_000,
    });
    // gpt-6.2-sol batch: 0.6 × $1 + 0.4 × $0.05 + 1 × $5.
    expect(costUsd("gpt-6.2-sol", usage, true)).toBeCloseTo(0.6 + 0.02 + 5);
  });
});

describe("estimateRunUsd", () => {
  it("multiplies one request's cost by the number of requests", () => {
    // 400 words, 6,000 tokens in and 4,000 out each, as a batch: the spec-time estimate.
    const usd = estimateRunUsd({
      model: "claude-opus-5-5",
      requests: 400,
      inputTokensPerRequest: 6000,
      outputTokensPerRequest: 4000,
      batch: true,
    });
    expect(usd).toBeCloseTo(400 * ((6000 * 4 + 4000 * 20) / 1e6) * 0.5);
  });
});

describe("cache-aware estimates", () => {
  it("measures output per request and the share of input read from cache", () => {
    const m = measureUsage([
      { input_tokens: 100, output_tokens: 4000, cache_creation_input_tokens: 5900 },
      { input_tokens: 100, output_tokens: 5000, cache_read_input_tokens: 5900 },
    ]);
    expect(m).toEqual({ outputTokens: 4500, cachedShare: 5900 / 12000 });
    expect(measureUsage([])).toBeNull();
  });

  it("charges the cached share at the cache-read price", () => {
    const opts = {
      model: "claude-opus-5-5" as const,
      requests: 1,
      inputTokensPerRequest: 1_000_000,
      outputTokensPerRequest: 0,
      batch: false,
    };
    expect(estimateRunUsd(opts)).toBeCloseTo(4);
    expect(estimateRunUsd({ ...opts, cachedShare: 0.5 })).toBeCloseTo(2 + 0.1);
  });
});

describe("isOutOfCredit", () => {
  it("recognizes Anthropic's billing error, old and new", () => {
    expect(isOutOfCredit({ status: 402, type: "billing_error" })).toBe(true);
    expect(isOutOfCredit({ status: 402 })).toBe(true);
    expect(isOutOfCredit({ status: 400, error: { error: { type: "billing_error" } } })).toBe(true);
    expect(
      isOutOfCredit({
        status: 400,
        message: "Your credit balance is too low to access the Anthropic API.",
      }),
    ).toBe(true);
  });

  it("recognizes OpenAI's insufficient_quota, which is not a rate limit", () => {
    expect(isOutOfCredit({ status: 429, code: "insufficient_quota" })).toBe(true);
    expect(isOutOfCredit({ status: 429, error: { code: "insufficient_quota" } })).toBe(true);
    expect(isOutOfCredit({ status: 429, code: "rate_limit_exceeded" })).toBe(false);
  });

  it("does not mistake other errors for running out", () => {
    expect(isOutOfCredit({ status: 400, message: "max_tokens too large" })).toBe(false);
    expect(isOutOfCredit({ status: 529, type: "overloaded_error" })).toBe(false);
    expect(isOutOfCredit(new Error("socket hang up"))).toBe(false);
    expect(isOutOfCredit(null)).toBe(false);
  });
});
