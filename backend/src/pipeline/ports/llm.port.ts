import type { z } from "zod";

/**
 * Ceiling on completion length, and a budget decision as much as a safety one.
 *
 * Groq bills `prompt_tokens + max_tokens` against the daily allowance the
 * moment a request is ACCEPTED, not what the model actually emits — so this
 * number sets how many clips a day can be evaluated at all.
 *
 * It looked like free money. It is not: gpt-oss is a reasoning model, and the
 * reasoning tokens are billed as completion. A measured worst case — one clip
 * naming three separate products — returned 1019 completion tokens, most of
 * them reasoning, against 1066 of prompt. An earlier 900 here did not truncate
 * politely; it produced HTTP 400 `json_validate_failed` with an EMPTY
 * `failed_generation`, which reads like a schema bug and is not one.
 *
 * 1600 is that measured worst case plus about half again. The real lever on
 * cost is `reasoningEffort`, not this.
 */
export const DEFAULT_LLM_MAX_TOKENS = 1600;

export interface LlmRequest<T> {
  system: string;
  user: string;
  /**
   * The response contract.
   *
   * The adapter derives the provider's JSON-schema payload from this same
   * object via zod-to-json-schema, then validates the reply against it. One
   * source of truth, so the runtime validator and the model's contract cannot
   * drift apart — which is what makes the per-request enum lock in stage 5
   * actually binding rather than merely requested.
   */
  schema: z.ZodType<T>;
  schemaName: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * How much the model may think before answering, where the provider
   * supports it.
   *
   * Reasoning tokens are billed as completion tokens and dominate stage 5's
   * cost: a three-product clip spent roughly 900 of its 1019 completion
   * tokens reasoning. Lowering this is the one change that could bring a full
   * 105-clip run inside a 200k/day allowance.
   *
   * Left unset by default. It has NOT been measured against the dev set — the
   * daily allowance ran out before the comparison could be run — and a
   * silently degraded segmentation quality would be far more expensive than
   * the tokens it saves. Set LLM_REASONING_EFFORT=low to run that comparison.
   */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface LlmResponse<T> {
  data: T;
  raw: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ILlmProvider {
  readonly name: string;
  readonly model: string;
  complete<T>(req: LlmRequest<T>): Promise<LlmResponse<T>>;
}
