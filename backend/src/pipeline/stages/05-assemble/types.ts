import { z } from "zod";
import { AnnotationsSchema, TranscriptSchema } from "@shared/stage-io";
import { ObservationCoreSchema } from "@shared/observation.schema";

export const AssembleStageInputSchema = z.object({
  transcript: TranscriptSchema,
  annotations: AnnotationsSchema,
});
export type AssembleStageInput = z.infer<typeof AssembleStageInputSchema>;

export const AssembleStageOutputSchema = z.object({
  observations: z.array(ObservationCoreSchema),
  /** Fields the model tried to fill with a value the annotations did not support. */
  rejectedValues: z.array(
    z.object({ field: z.string(), value: z.unknown(), reason: z.string() }),
  ),
  /**
   * Product mentions stage 3 resolved that no observation claimed.
   *
   * A non-empty list means the model was told about a product and returned
   * nothing for it — the dominant recall failure on multi-observation clips.
   * Reported rather than repaired: fabricating an observation to cover a
   * mention would put an invented row on a dashboard, which is the one
   * failure this pipeline treats as unacceptable.
   */
  unattributedMentions: z.array(z.object({ index: z.number().int(), raw: z.string() })),
});
export type AssembleStageOutput = z.infer<typeof AssembleStageOutputSchema>;

export interface AssembleStageOptions {
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}
