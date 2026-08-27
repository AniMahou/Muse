import { z } from "zod";
import { ObservationCoreSchema } from "./observation.schema";

/**
 * Ground truth for the evaluation set.
 *
 * This is validated as strictly as production data — more so, in fact. When
 * three people are hand-labelling a hundred clips, inconsistent labels
 * silently corrupt every metric downstream and the corruption is invisible
 * for a week. A schema at the door is the cheapest possible defence.
 */
export const ClipLabelSchema = z.object({
  clipId: z.string().min(1),
  audioFile: z.string().min(1),

  /**
   * Verbatim human transcription — the reference for WER/CER.
   *
   * Optional, because it is the ONLY thing that needs it. Field accuracy is
   * scored against the expected observations, which come from the recording
   * scenario rather than from anything anyone heard, so a clip with no
   * transcript is still fully scoreable on the metric that matters. Blocking
   * on transcription would have made the whole set unmeasurable until every
   * clip was typed out by hand.
   *
   * Clips without one are simply excluded from the word error rate.
   */
  transcriptBn: z.string().default(""),

  /** What a competent human would extract from this clip. */
  observations: z.array(ObservationCoreSchema),

  /** Ground truth for stage 4, independent of what the resolver guesses. */
  outletId: z.string().nullable(),
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),

  meta: z.object({
    /** Dhaka-standard only for v1. Dialect clips are labelled but excluded. */
    dialect: z.enum(["dhaka", "chittagong", "sylhet", "other"]).default("dhaka"),
    /**
     * "unknown" is a real answer and defaulting is not. The noise mix is the
     * experiment — the claim is that fields survive bad audio — so guessing
     * would invent the one variable the evaluation exists to vary. Unknown
     * clips are excluded from any breakdown by noise.
     */
    noise: z.enum(["quiet", "moderate", "loud", "unknown"]).default("unknown"),
    speakerId: z.string().optional(),
    durationSec: z.number().optional(),
    labelledBy: z.string().optional(),
    labelledAt: z.string().optional(),
    /** Promoted from a production correction rather than originally collected. */
    promotedFromCorrection: z.boolean().default(false),
  }),
});
export type ClipLabel = z.infer<typeof ClipLabelSchema>;

export const LabelSetSchema = z.array(ClipLabelSchema);
export type LabelSet = z.infer<typeof LabelSetSchema>;
