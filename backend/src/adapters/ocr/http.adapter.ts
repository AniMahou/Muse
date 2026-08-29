import type { Transcript, Word } from "@shared/stage-io";
import type { IOcrProvider, OcrRequest } from "@/pipeline/ports";
import { ProviderError } from "@/common/errors";
import { USER_AGENT } from "@/adapters/user-agent";

interface RecogniseReply {
  text: string;
  words: Array<{ w: string; conf: number }>;
  lines: number;
  error?: string;
}

/**
 * The trained CRNN, over HTTP to a local Python process (see ml/ocr/serve.py).
 *
 * `simulated` is false, and that word is load-bearing: it propagates onto the
 * clip and every screen that shows it, so switching this on changes what the
 * product claims about itself. Nothing here should be enabled by default
 * without someone deciding to.
 *
 * WHAT THIS DOES AND DOES NOT MEASURE. Reading a photograph takes two models —
 * one to find the lines, one to read them — and only the second was trained.
 * Line finding is classical morphology standing in for a detector we have not
 * built. On held-out photographs the recogniser alone, given a correctly
 * cropped line, scores CER 0.742; end to end on a whole photograph it is
 * meaningfully worse, because detection errors compound into recognition.
 *
 * Per-word confidence is real — the probability the network assigned to the
 * characters it emitted — but it covers only recognition. A perfectly
 * confident reading of a badly cropped region is confidently wrong, and
 * nothing downstream can tell.
 */
export class HttpOcrProvider implements IOcrProvider {
  readonly name = "muse-crnn";
  readonly simulated = false;

  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly timeoutMs = 30_000,
  ) {}

  async recognise(req: OcrRequest): Promise<Transcript> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/recognise`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ image: Buffer.from(req.image).toString("base64") }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new ProviderError(this.name, `HTTP ${res.status}: ${text.slice(0, 300)}`, res.status >= 500);
      }

      const reply = (await res.json()) as RecogniseReply;
      if (reply.error) throw new ProviderError(this.name, reply.error, false);

      return toTranscript(reply, this.name, this.model, req.language ?? "bn");
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProviderError(this.name, `timed out after ${this.timeoutMs}ms`, true);
      }
      // The service is a separate process that has to be started by hand, so
      // the likeliest failure by far is that it simply is not running. Say so
      // rather than reporting a bare ECONNREFUSED from inside a worker.
      const detail = err instanceof Error ? err.message : String(err);
      throw new ProviderError(
        this.name,
        `${detail} — is the recogniser running? cd ml && python -m ocr.serve`,
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Spans are computed over the joined text rather than taken from the service.
 *
 * Everything downstream — the quantity grammar, the phonetic resolver, stage 6
 * — addresses the transcript by character offset, so a span that does not
 * index the string it accompanies produces annotations pointing at the wrong
 * words. Building both here from one source keeps them consistent by
 * construction.
 */
function toTranscript(
  reply: RecogniseReply,
  provider: string,
  model: string,
  language: string,
): Transcript {
  const words: Word[] = [];
  let cursor = 0;
  const parts: string[] = [];

  for (const { w, conf } of reply.words) {
    if (w.length === 0) continue;
    if (parts.length > 0) cursor += 1; // the joining space
    parts.push(w);
    words.push({ w, start: 0, end: 0, conf, span: [cursor, cursor + w.length] });
    cursor += w.length;
  }

  return {
    text: parts.join(" "),
    words,
    language,
    durationSec: null,
    provider,
    model,
    // Not derived: CTC gives the probability the model actually assigned.
    confidenceDerived: false,
  };
}
