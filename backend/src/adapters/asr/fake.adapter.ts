import type { Transcript } from "@shared/stage-io";
import type { AsrRequest, IAsrProvider } from "@/pipeline/ports";
import { transcriptFromText } from "@/common/transcript";

export type FakeTranscriptSource = Transcript | string;

/**
 * Replays committed transcripts instead of calling a provider.
 *
 * Every tier 0/1/3 test runs against this. It is what makes tests over a
 * stochastic component deterministic, and it is why the suite runs in
 * milliseconds and needs no network or API key.
 *
 * An unknown clip throws rather than inventing a transcript — a test that
 * silently ran against fabricated input would be worse than a failing one.
 */
export class FakeAsrProvider implements IAsrProvider {
  readonly name = "fake";
  readonly model = "fixture";

  private readonly clips: Map<string, FakeTranscriptSource>;
  private readonly defaultConf: number;

  private readonly fallbackText: string | null;

  constructor(
    clips: Record<string, FakeTranscriptSource> | Map<string, FakeTranscriptSource> = {},
    opts: { defaultConf?: number; fallbackText?: string } = {},
  ) {
    this.clips = clips instanceof Map ? new Map(clips) : new Map(Object.entries(clips));
    this.defaultConf = opts.defaultConf ?? 0.9;
    // Opt-in only. Tests never set this, so an unregistered clip still throws
    // and a test can never silently run against invented input. Demo mode
    // sets it deliberately, to run the pipeline with no network at all.
    this.fallbackText = opts.fallbackText ?? null;
  }

  set(clipId: string, source: FakeTranscriptSource): this {
    this.clips.set(clipId, source);
    return this;
  }

  async transcribe(req: AsrRequest): Promise<Transcript> {
    const found = this.clips.get(req.clipId) ?? this.fallbackText ?? undefined;
    if (found === undefined) {
      throw new Error(
        `FakeAsrProvider has no fixture for clip "${req.clipId}". ` +
          `Register one with .set(clipId, transcriptOrText), or construct with ` +
          `{ fallbackText } for demo mode.`,
      );
    }
    if (typeof found === "string") {
      return transcriptFromText(found, {
        conf: this.defaultConf,
        provider: this.name,
        model: this.model,
        language: req.language ?? "bn",
      });
    }
    return found;
  }
}
