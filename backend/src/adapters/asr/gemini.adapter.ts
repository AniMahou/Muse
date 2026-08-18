import type { Transcript } from "@shared/stage-io";
import type { AsrRequest, IAsrProvider } from "@/pipeline/ports";
import { ProviderError } from "@/common/errors";
import { transcriptFromText } from "@/common/transcript";
import { OPAQUE_PROVIDER_CONFIDENCE } from "./confidence";

/**
 * Gemini Flash, which accepts audio natively.
 *
 * Free through AI Studio with no credit card. Two caveats that belong in the
 * open rather than buried:
 *
 *   1. It returns TEXT ONLY — no timestamps, no log-probabilities, nothing
 *      from which real per-word confidence could be derived. Every word gets
 *      the same mid-range value and the transcript is flagged
 *      `confidenceDerived`. That materially weakens stage 6, which loses one
 *      of its multiplied terms, so this provider is a fallback rather than
 *      the default.
 *
 *   2. On the free tier Google may use submitted data to improve their
 *      products. Fine for development; NOT for real customer field audio.
 */
export class GeminiAsrProvider implements IAsrProvider {
  readonly name = "gemini";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
    private readonly timeoutMs = 60_000,
  ) {}

  async transcribe(req: AsrRequest): Promise<Transcript> {
    if (!this.apiKey) throw new ProviderError(this.name, "GEMINI_API_KEY is not set", false);

    const prompt =
      req.language === "bn"
        ? "Transcribe this audio verbatim in Bengali script. Output only the transcription, " +
          "with no translation, commentary, or formatting."
        : "Transcribe this audio verbatim. Output only the transcription.";

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: req.mimeType, data: toBase64(req.audio) } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
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
        const errBody = await res.text().catch(() => "");
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(this.name, `HTTP ${res.status}: ${errBody.slice(0, 400)}`, retryable);
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
      if (text.length === 0) throw new ProviderError(this.name, "empty transcription", true);

      return transcriptFromText(text, {
        conf: OPAQUE_PROVIDER_CONFIDENCE,
        provider: this.name,
        model: this.model,
        language: req.language ?? "bn",
        confidenceDerived: true,
      });
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

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
