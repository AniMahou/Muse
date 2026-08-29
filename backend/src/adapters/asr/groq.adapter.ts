import type { Transcript, Word } from "@shared/stage-io";
import type { AsrRequest, IAsrProvider } from "@/pipeline/ports";
import { extensionForMime } from "@/common/audio";
import { ProviderError } from "@/common/errors";
import { USER_AGENT } from "@/adapters/user-agent";
import { attachSpans } from "@/common/transcript";
import { segmentConfidence } from "./confidence";

interface GroqSegment {
  text?: string;
  start?: number;
  end?: number;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}
interface GroqWord {
  word?: string;
  start?: number;
  end?: number;
}
interface GroqVerboseResponse {
  text?: string;
  duration?: number;
  language?: string;
  segments?: GroqSegment[];
  words?: GroqWord[];
}

/**
 * Groq-hosted whisper-large-v3.
 *
 * The default ASR for this project: a free API key with no credit card, and
 * roughly two thousand audio requests a day, which is far beyond what a
 * hundred-clip evaluation set needs.
 *
 * Asks for word-level timestamps AND segments, then derives per-word
 * confidence from the containing segment's avg_logprob — the API reports no
 * per-word figure. See confidence.ts for the mapping and why it is written
 * down rather than assumed.
 */
/**
 * Pack catalogue terms into a prompt the decoder can actually use.
 *
 * Comma-separated rather than a sentence: Whisper treats the prompt as prior
 * context, and a fluent sentence biases the STYLE of the output as well as its
 * vocabulary, which is not what we want. A bare list biases vocabulary alone.
 */
export function buildBiasPrompt(terms: string[] | undefined, maxBytes = 860): string | null {
  if (!terms || terms.length === 0) return null;

  const seen = new Set<string>();
  const out: string[] = [];
  let bytes = 0;

  for (const raw of terms) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());

    // Budgeted in UTF-8 BYTES, which is what the API counts — and the two part
    // company badly here. Bengali sits in the 3-byte range, so a list that
    // measures 525 JavaScript characters is 1123 bytes on the wire. Counting
    // characters sailed past a 896-byte limit and every request 400'd, which is
    // a failure mode that simply does not appear while the vocabulary is Latin.
    const cost = Buffer.byteLength(t, "utf8") + 2;
    if (bytes + cost > maxBytes) break;
    out.push(t);
    bytes += cost;
  }

  return out.length ? out.join(", ") : null;
}

export class GroqAsrProvider implements IAsrProvider {
  readonly name = "groq";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.groq.com/openai/v1",
    private readonly timeoutMs = 60_000,
  ) {}

  async transcribe(req: AsrRequest): Promise<Transcript> {
    if (!this.apiKey) throw new ProviderError(this.name, "GROQ_API_KEY is not set", false);

    // Copy into a plain ArrayBuffer. TypeScript 5.7 made Uint8Array generic
    // over its backing buffer, and a possibly-SharedArrayBuffer view is not a
    // valid BlobPart.
    const bytes = new ArrayBuffer(req.audio.byteLength);
    new Uint8Array(bytes).set(req.audio);

    const form = new FormData();
    // Groq identifies the container from the filename as well as the
    // content type, so the extension has to follow the actual bytes.
    const filename = `${req.clipId}${extensionForMime(req.mimeType)}`;
    form.append("file", new Blob([bytes], { type: req.mimeType }), filename);
    form.append("model", this.model);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    // Forcing the language materially beats auto-detection for Bangla.
    if (req.language) form.append("language", req.language);

    // Whisper conditions its decoder on this prefix, which lifts the token
    // probabilities of the words in it. Capped at ~220 tokens because the API
    // truncates a long prompt from the FRONT — an over-long list would silently
    // drop the terms at its head rather than erroring.
    const bias = buildBiasPrompt(req.biasTerms);
    if (bias) form.append("prompt", bias);

    const res = await this.post(form);
    return this.toTranscript(res, req);
  }

  private async post(form: FormData): Promise<GroqVerboseResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "User-Agent": USER_AGENT },
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // 429 and 5xx are worth retrying; a 400 will fail identically forever.
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(this.name, `HTTP ${res.status}: ${body.slice(0, 400)}`, retryable);
      }
      return (await res.json()) as GroqVerboseResponse;
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

  private toTranscript(res: GroqVerboseResponse, req: AsrRequest): Transcript {
    const text = (res.text ?? "").trim();
    const segments = res.segments ?? [];

    // Confidence per segment, then each word inherits the segment covering it.
    const segConf = segments.map((s) => ({
      start: s.start ?? 0,
      end: s.end ?? 0,
      conf: segmentConfidence({
        avgLogprob: s.avg_logprob,
        noSpeechProb: s.no_speech_prob,
        compressionRatio: s.compression_ratio,
      }),
    }));

    const meanConf =
      segConf.length > 0 ? segConf.reduce((a, s) => a + s.conf, 0) / segConf.length : 0.75;

    const bare = (res.words ?? [])
      .map((w) => ({
        w: (w.word ?? "").trim(),
        start: w.start ?? 0,
        end: w.end ?? 0,
        conf: confAt(segConf, w.start ?? 0, meanConf),
      }))
      .filter((w) => w.w.length > 0);

    const words: Word[] =
      bare.length > 0
        ? attachSpans(text, bare)
        : // No word timestamps came back; fall back to tokenising the text so
          // downstream span lookups still work, at the segment confidence.
          attachSpans(
            text,
            text
              .split(/\s+/)
              .filter(Boolean)
              .map((w) => ({ w, start: 0, end: 0, conf: meanConf })),
          );

    return {
      text,
      words,
      language: res.language ?? req.language ?? "bn",
      durationSec: res.duration ?? null,
      provider: this.name,
      model: this.model,
      confidenceDerived: true,
    };
  }
}

function confAt(
  segs: Array<{ start: number; end: number; conf: number }>,
  t: number,
  fallback: number,
): number {
  for (const s of segs) if (t >= s.start && t <= s.end) return s.conf;
  return fallback;
}
