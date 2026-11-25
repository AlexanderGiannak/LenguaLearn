// Shared plumbing for the content scripts that call paid AI services: prices, cost
// estimates, and recognizing "out of credit" so a run can stop cleanly and resume later.

/** US dollars per million tokens. Batch requests cost half (both providers). */
export const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
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
 */
export function estimateRunUsd(opts: {
  model: PricedModel;
  requests: number;
  inputTokensPerRequest: number;
  outputTokensPerRequest: number;
  batch: boolean;
}): number {
  return (
    opts.requests *
    costUsd(
      opts.model,
      { input_tokens: opts.inputTokensPerRequest, output_tokens: opts.outputTokensPerRequest },
      opts.batch,
    )
  );
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
