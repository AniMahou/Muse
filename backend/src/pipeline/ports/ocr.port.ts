import type { Transcript } from "@shared/stage-io";

export interface OcrRequest {
  clipId: string;
  image: Uint8Array;
  mimeType: string;
  language?: string;
}

/**
 * Image to text.
 *
 * Deliberately returns the SAME `Transcript` shape as speech recognition. A
 * photographed promo sign and a spoken sentence are both just text with
 * per-token confidence and character spans, so everything downstream — the
 * quantity grammar, the phonetic resolver, the confidence gate — works on
 * either without knowing which it got.
 */
export interface IOcrProvider {
  readonly name: string;
  readonly model: string;
  /** True when this implementation returns canned output rather than reading pixels. */
  readonly simulated: boolean;
  recognise(req: OcrRequest): Promise<Transcript>;
}
