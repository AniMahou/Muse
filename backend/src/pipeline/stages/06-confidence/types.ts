import { z } from "zod";
import { AnnotationsSchema, TranscriptSchema, ScoredObservationSchema } from "@shared/stage-io";
import { ObservationCoreSchema } from "@shared/observation.schema";

export const ConfidenceStageInputSchema = z.object({
  transcript: TranscriptSchema,
  annotations: AnnotationsSchema,
  observations: z.array(ObservationCoreSchema),
});
export type ConfidenceStageInput = z.infer<typeof ConfidenceStageInputSchema>;

export const ConfidenceStageOutputSchema = z.object({
  observations: z.array(ScoredObservationSchema),
});
export type ConfidenceStageOutput = z.infer<typeof ConfidenceStageOutputSchema>;

export interface ConfidenceStageOptions {
  /** A critical field below this gets the rep a one-tap question. */
  threshold?: number;
  /**
   * Fields worth interrupting someone over.
   *
   * Accepts snake_case or camelCase; both are normalised. Getting `severity`
   * wrong costs nothing, getting `quantity` wrong poisons a dashboard — so
   * the two must not be gated the same way.
   */
  criticalFields?: string[];
  /**
   * Margin at which a resolver is treated as fully decisive. Below it,
   * confidence is scaled down toward `marginFloor`.
   */
  marginSaturatesAt?: number;
  /** Multiplier applied when the resolver margin is zero. */
  marginFloor?: number;
  /** Multiplier for fields the model produced with no upstream evidence. */
  modelOnlyPenalty?: number;
}
