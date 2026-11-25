// Shared plumbing for the content scripts that call paid AI services: prices, cost
// estimates, and recognizing "out of credit" so a run can stop cleanly and resume later.

/** US dollars per million tokens. Batch requests cost half (both providers). */
export const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // OpenAI has no cache-write charge; its usage counts cached tokens inside input_tokens,
  // which openAiUsage() separates.
  "gpt-6.2-sol": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2 },
} as const satisfies Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
>;
export type PricedModel = keyof typeof PRICES;

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function costUsd(model: PricedModel, usage: Usage, batch: boolean): number {
  const p = PRICES[model];
  const perToken =
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite;
  return (perToken / 1_000_000) * (batch ? 0.5 : 1);
}

/**
 * The cost of a run before it starts. Input tokens are measured (token counting); output,
 * which includes the model's thinking, is an estimate until a sample run measures it.
 * cachedShare is the share of input tokens that past answers read from the prompt cache
 * (0 until measured, which overestimates).
 */
export function estimateRunUsd(opts: {
  model: PricedModel;
  requests: number;
  inputTokensPerRequest: number;
  outputTokensPerRequest: number;
  cachedShare?: number;
  batch: boolean;
}): number {
  const cached = Math.round(opts.inputTokensPerRequest * (opts.cachedShare ?? 0));
  return (
    opts.requests *
    costUsd(
      opts.model,
      {
        input_tokens: opts.inputTokensPerRequest - cached,
        cache_read_input_tokens: cached,
        output_tokens: opts.outputTokensPerRequest,
      },
      opts.batch,
    )
  );
}

/** Averages over past answers' usage: output tokens and the share of input read from cache. */
export function measureUsage(
  usages: Usage[],
): { outputTokens: number; cachedShare: number } | null {
  if (usages.length === 0) return null;
  let output = 0;
  let cached = 0;
  let input = 0;
  for (const u of usages) {
    output += u.output_tokens;
    const fromCache = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    cached += u.cache_read_input_tokens ?? 0;
    input += u.input_tokens + fromCache;
  }
  return {
    outputTokens: Math.round(output / usages.length),
    cachedShare: input > 0 ? cached / input : 0,
  };
}

/**
 * Whether an error from the Anthropic or OpenAI SDK means the account has no credit left.
 * Anthropic answers 402 billing_error (older accounts: 400 "credit balance is too low");
 * OpenAI answers 429 with code insufficient_quota, which is not a rate limit and must not
 * be retried.
 */
export function isOutOfCredit(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    status?: number;
    type?: string;
    code?: string;
    message?: string;
    error?: { type?: string; code?: string; error?: { type?: string } };
  };
  const types = [e.type, e.error?.type, e.error?.error?.type, e.code, e.error?.code];
  if (e.status === 402 || types.includes("billing_error")) return true;
  if (types.includes("insufficient_quota")) return true;
  return e.status === 400 && /credit balance/i.test(e.message ?? "");
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

/** OpenAI Responses usage in the shape costUsd takes. */
export function openAiUsage(u: {
  input_tokens: number;
  output_tokens: number;
  input_tokens_details?: { cached_tokens?: number | null } | null;
}): Usage {
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  return {
    input_tokens: u.input_tokens - cached,
    cache_read_input_tokens: cached,
    output_tokens: u.output_tokens,
  };
}
