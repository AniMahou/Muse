import { z } from "zod";
import { TranscriptSchema, OutletResolutionSchema } from "@shared/stage-io";

export const OutletStageInputSchema = z.object({
  transcript: TranscriptSchema,
  companyId: z.string(),
  /** Captured in the PWA at record time. Unrecoverable later — the rep moves on. */
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  /** Set when the rep confirmed the outlet in the app. Overrides matching entirely. */
  declaredOutletId: z.string().nullable(),
});
export type OutletStageInput = z.infer<typeof OutletStageInputSchema>;

export const OutletStageOutputSchema = z.object({
  outlet: OutletResolutionSchema,
});
export type OutletStageOutput = z.infer<typeof OutletStageOutputSchema>;

export interface OutletResolverOptions {
  /** Metres. Wide enough to survive GPS error, narrow enough to stay useful. */
  radiusM?: number;
  maxCandidates?: number;
  maxWindow?: number;
  /**
   * Name similarity at or above which the spoken name is taken to dominate
   * proximity. Below it, ranking is by distance alone.
   */
  nameConfidentAt?: number;
  /** Weight given to proximity once a confident spoken name exists. */
  geoWeightWithName?: number;
}
