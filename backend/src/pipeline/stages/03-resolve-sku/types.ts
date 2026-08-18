import { z } from "zod";
import { TranscriptSchema, SkuAnnotationSchema } from "@shared/stage-io";

export const SkuStageInputSchema = z.object({
  transcript: TranscriptSchema,
  companyId: z.string(),
  /** The rep's brand portfolio. Scopes the candidate set — see ICatalogRepo. */
  brands: z.array(z.string()).optional(),
});
export type SkuStageInput = z.infer<typeof SkuStageInputSchema>;

export const SkuStageOutputSchema = z.object({
  skus: z.array(SkuAnnotationSchema),
});
export type SkuStageOutput = z.infer<typeof SkuStageOutputSchema>;

export interface SkuResolverOptions {
  /** Below this a window is not considered a product mention at all. */
  minScore?: number;
  /** Candidates retained per matched span, best first. */
  maxCandidates?: number;
  /** Longest run of transcript tokens considered as one product mention. */
  maxWindow?: number;
  /**
   * Multiplier applied to a match that came through an approved alias.
   *
   * Above 1 on purpose: an alias is a human decision that this surface form
   * means this product, which is strictly better evidence than a string
   * similarity score. This is what makes the review queue's approvals
   * actually change resolver behaviour.
   */
  aliasBoost?: number;
}
