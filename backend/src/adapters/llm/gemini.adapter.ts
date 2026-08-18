import { toStrictJsonSchema } from "./json-schema";
import type { ILlmProvider, LlmRequest, LlmResponse } from "@/pipeline/ports";
import { ProviderError } from "@/common/errors";
import { parseAndValidate } from "./groq.adapter";

/**
 * Gemini Flash with a response schema.
 *
 * Free through AI Studio with no credit card. Gemini's schema dialect is a
 * restricted subset of JSON Schema, so the generated document is pruned
 * before it is sent; the reply is still validated against the full Zod object
 * afterwards, which is where the real guarantee lives.
 */
export class GeminiLlmProvider implements ILlmProvider {
  readonly name = "gemini";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
    private readonly timeoutMs = 30_000,
  ) {}

  async complete<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    if (!this.apiKey) throw new ProviderError(this.name, "GEMINI_API_KEY is not set", false);

    const jsonSchema = toStrictJsonSchema(req.schema);

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0,
        maxOutputTokens: req.maxTokens ?? 2048,
        responseMimeType: "application/json",
        responseSchema: pruneForGemini(jsonSchema),
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(this.name, `HTTP ${res.status}: ${text.slice(0, 400)}`, retryable);
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (raw.length === 0) throw new ProviderError(this.name, "empty completion", true);

      const validated = parseAndValidate(this.name, raw, req);
      const u = json.usageMetadata;
      return u
        ? {
            ...validated,
            usage: {
              ...(u.promptTokenCount !== undefined ? { promptTokens: u.promptTokenCount } : {}),
              ...(u.candidatesTokenCount !== undefined
                ? { completionTokens: u.candidatesTokenCount }
                : {}),
            },
          }
        : validated;
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

/**
 * Strip keywords Gemini's schema subset rejects.
 *
 * It accepts type, format, description, nullable, enum, properties, required,
 * items and little else — notably not $schema, additionalProperties, $ref or
 * the composition keywords. Anything unrecognised is a request error rather
 * than a warning, so the document is pruned rather than hoped over.
 */
export function pruneForGemini(schema: unknown): unknown {
  const ALLOWED = new Set([
    "type", "format", "description", "nullable", "enum",
    "properties", "required", "items", "minItems", "maxItems",
  ]);

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (!ALLOWED.has(k)) continue;
      out[k] = k === "properties" && v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, walk(pv)]))
        : walk(v);
    }
    return out;
  };

  return walk(schema);
}
