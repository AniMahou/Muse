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
});
export type AssembleStageOutput = z.infer<typeof AssembleStageOutputSchema>;

export interface AssembleStageOptions {
  temperature?: number;
  maxTokens?: number;
}
