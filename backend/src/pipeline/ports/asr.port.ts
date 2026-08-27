import type { Transcript } from "@shared/stage-io";

export interface AsrRequest {
  clipId: string;
  audio: Uint8Array;
  mimeType: string;
  /** ISO 639-1. Forcing it materially beats auto-detection for Bangla. */
  language?: string;
  /**
   * Decode-time vocabulary bias — the customer's brands, products and outlets.
   *
   * Whisper's decoder is autoregressive and conditions on a prompt prefix, so
   * seeding it with the words that are about to be said raises their token
   * probabilities. This matters more here than in general transcription: our
   * errors are concentrated in PROPER NOUNS — brand and shop names no general
   * acoustic model has been trained on — while the surrounding grammar comes
   * back fine. Biasing attacks exactly that failure and nothing else.
   *
   * It is a bias, not a constraint. The model may still emit anything; the
   * guarantee that an unresolvable product cannot reach the database lives in
   * stage 5's per-clip enum, not here.
   */
  biasTerms?: string[];
}

/**
 * Speech to text.
 *
 * Implementations MUST return per-word confidence. Providers that expose only
 * a segment-level average log-probability derive it and set
 * `confidenceDerived: true` — stage 6 treats this value as evidence, so
 * where it came from has to be visible rather than assumed.
 */
export interface IAsrProvider {
  readonly name: string;
  readonly model: string;
  transcribe(req: AsrRequest): Promise<Transcript>;
}
