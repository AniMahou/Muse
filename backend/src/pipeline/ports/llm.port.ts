import type { z } from "zod";

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
