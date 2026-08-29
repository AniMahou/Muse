import { toStrictJsonSchema } from "./json-schema";
import type { ILlmProvider, LlmRequest, LlmResponse } from "@/pipeline/ports";
import { ProviderError } from "@/common/errors";
import { USER_AGENT } from "@/adapters/user-agent";

/**
 * Groq chat completions in JSON-schema mode.
 *
 * The provider payload is derived from the caller's Zod object via
 * zod-to-json-schema, and the reply is validated against that SAME object.
 * One source of truth, so the model's contract and the runtime validator
 * cannot drift — which is what makes stage 5's per-clip enum lock binding
 * rather than merely requested.
 */
export class GroqLlmProvider implements ILlmProvider {
  readonly name = "groq";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.groq.com/openai/v1",
    private readonly timeoutMs = 30_000,
  ) {}

  async complete<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    if (!this.apiKey) throw new ProviderError(this.name, "GROQ_API_KEY is not set", false);

    const jsonSchema = toStrictJsonSchema(req.schema);

    const body = {
      model: this.model,
      temperature: req.temperature ?? 0,
      max_tokens: req.maxTokens ?? 2048,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: req.schemaName, schema: jsonSchema, strict: true },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "User-Agent": USER_AGENT,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(this.name, `HTTP ${res.status}: ${text.slice(0, 400)}`, retryable);
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const raw = json.choices?.[0]?.message?.content ?? "";
      if (raw.length === 0) throw new ProviderError(this.name, "empty completion", true);

      return { ...parseAndValidate(this.name, raw, req), ...usageOf(json.usage) };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError(this.name, `timed out after ${this.timeoutMs}ms`, true);
      }
      throw new ProviderError(this.name, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseAndValidate<T>(
  provider: string,
  raw: string,
  req: LlmRequest<T>,
): LlmResponse<T> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new ProviderError(provider, `reply was not valid JSON: ${raw.slice(0, 200)}`, true);
  }

  const parsed = req.schema.safeParse(candidate);
  if (!parsed.success) {
    // Retryable: schema violations are usually a sampling accident, and at
    // temperature 0 a retry that keeps failing will surface as a dead job
    // rather than as silently wrong data.
    throw new ProviderError(
      provider,
      `reply failed schema "${req.schemaName}": ${JSON.stringify(parsed.error.issues).slice(0, 400)}`,
      true,
    );
  }
  return { data: parsed.data, raw };
}

function usageOf(u?: { prompt_tokens?: number; completion_tokens?: number }) {
  if (!u) return {};
  return {
    usage: {
      ...(u.prompt_tokens !== undefined ? { promptTokens: u.prompt_tokens } : {}),
      ...(u.completion_tokens !== undefined ? { completionTokens: u.completion_tokens } : {}),
    },
  };
}
