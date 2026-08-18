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
   * Name similarity at which the spoken name carries its full weight.
   *
   * Used as the top of a RAMP, not as an on/off gate. An earlier version
   * switched hard at this value and discarded the name signal entirely below
   * it — which, on real speech recognition output, ranked the wrong shop
   * first while holding a perfectly good name match it had chosen to ignore.
   */
  nameConfidentAt?: number;
  /** Below this a name match is noise and contributes nothing. */
  nameFloor?: number;
  /** Largest share of the score the name may take, at full confidence. */
  maxNameWeight?: number;
}
