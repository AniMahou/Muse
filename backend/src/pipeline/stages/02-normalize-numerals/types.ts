import { z } from "zod";
import { TranscriptSchema, QuantityAnnotationSchema } from "@shared/stage-io";

export const NumeralStageInputSchema = z.object({
  transcript: TranscriptSchema,
});
export type NumeralStageInput = z.infer<typeof NumeralStageInputSchema>;

export const NumeralStageOutputSchema = z.object({
  quantities: z.array(QuantityAnnotationSchema),
});
export type NumeralStageOutput = z.infer<typeof NumeralStageOutputSchema>;

export interface NumeralStageOptions {
  /**
   * Minimum PHONETIC similarity for a token that is not a lexicon hit to
   * still be read as a numeral. Below this it is an ordinary word.
   *
   * Set high (0.85) on purpose. A false-positive quantity is expensive — it
   * invents a number nobody said — and phonetic space already collapses the
   * corruptions worth recovering, so the threshold does not need to be
   * generous to earn its keep.
   */
  fuzzyThreshold?: number;
  /** Confidence multiplier when the match came from a listed variant spelling. */
  variantPenalty?: number;
  /** Confidence multiplier when the match came from phonetic fuzz. Lower than
   *  `variantPenalty`: an unlisted spelling is weaker evidence than a known one. */
  fuzzyPenalty?: number;
}
