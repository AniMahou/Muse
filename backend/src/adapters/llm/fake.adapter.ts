import type { ILlmProvider, LlmRequest, LlmResponse } from "@/pipeline/ports";
import { sha256 } from "@/common/hash";

export type FakeLlmHandler = (req: LlmRequest<unknown>) => unknown | Promise<unknown>;

/**
 * Cassette-style LLM double.
 *
 * Two modes, both deterministic:
 *   - `handler`   compute a reply from the request (most tests)
 *   - `responses` keyed replay of recorded provider output (stage 5 fixtures)
 *
 * The reply is still validated against the caller's Zod schema, exactly as a
 * real adapter would. A fixture that drifts out of contract therefore fails
 * the test rather than quietly propagating — which is the whole point of
 * recording them.
 */
export class FakeLlmProvider implements ILlmProvider {
  readonly name = "fake";
  readonly model = "cassette";

  private readonly handler?: FakeLlmHandler;
  private readonly responses: Map<string, unknown>;
  readonly calls: Array<LlmRequest<unknown>> = [];

  constructor(opts: { handler?: FakeLlmHandler; responses?: Record<string, unknown> } = {}) {
    this.handler = opts.handler;
    this.responses = new Map(Object.entries(opts.responses ?? {}));
  }

  /** Cassette key: schema name plus a hash of the rendered user prompt. */
  static key(schemaName: string, user: string): string {
    return `${schemaName}:${sha256(user).slice(0, 16)}`;
  }

  set(key: string, value: unknown): this {
    this.responses.set(key, value);
    return this;
  }

  async complete<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    this.calls.push(req as LlmRequest<unknown>);

    let candidate: unknown;
    if (this.handler) {
      candidate = await this.handler(req as LlmRequest<unknown>);
    } else {
      const key = FakeLlmProvider.key(req.schemaName, req.user);
      if (!this.responses.has(key)) {
        throw new Error(
          `FakeLlmProvider has no cassette for "${key}". ` +
            `Record one, or construct with a handler.`,
        );
      }
      candidate = this.responses.get(key);
    }

    const parsed = req.schema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `FakeLlmProvider reply failed schema "${req.schemaName}": ` +
          JSON.stringify(parsed.error.issues),
      );
    }
    return { data: parsed.data, raw: JSON.stringify(candidate) };
  }
}
