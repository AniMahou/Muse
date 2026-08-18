import type { IAsrProvider } from "@/pipeline/ports";
import { ProviderError } from "@/common/errors";
import type { TranscribeStageInput, TranscribeStageOutput } from "./types";

/**
 * Stage 1 — audio to text.
 *
 * A thin stage on purpose. All the provider-specific work (word alignment,
 * confidence derivation, error classification) belongs in the adapters, so
 * that swapping ASR is a container change and nothing here moves.
 *
 * The one piece of logic it does own is the empty-transcript guard: an empty
 * string is not a valid transcript, and letting it through would produce a
 * clip that silently yields no observations with no explanation of why.
 */
export class TranscribeStage {
  readonly name = "01-transcribe";

  constructor(private readonly asr: IAsrProvider) {}

  async run(input: TranscribeStageInput): Promise<TranscribeStageOutput> {
    if (input.audio.byteLength === 0) {
      throw new ProviderError(this.asr.name, `clip ${input.clipId} has no audio`, false);
    }

    const transcript = await this.asr.transcribe({
      clipId: input.clipId,
      audio: input.audio,
      mimeType: input.mimeType,
      ...(input.language ? { language: input.language } : {}),
    });

    if (transcript.text.trim().length === 0) {
      throw new ProviderError(
        this.asr.name,
        `clip ${input.clipId} transcribed to an empty string`,
        true,
      );
    }

    return { transcript };
  }
}
