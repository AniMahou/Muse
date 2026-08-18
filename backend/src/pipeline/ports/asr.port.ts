import type { Transcript } from "@shared/stage-io";

export interface AsrRequest {
  clipId: string;
  audio: Uint8Array;
  mimeType: string;
  /** ISO 639-1. Forcing it materially beats auto-detection for Bangla. */
  language?: string;
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
