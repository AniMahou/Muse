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

  /** Verbatim human transcription. The reference for WER/CER. */
  transcriptBn: z.string().min(1),

  /** What a competent human would extract from this clip. */
  observations: z.array(ObservationCoreSchema),

  /** Ground truth for stage 4, independent of what the resolver guesses. */
  outletId: z.string().nullable(),
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable(),

  meta: z.object({
    /** Dhaka-standard only for v1. Dialect clips are labelled but excluded. */
    dialect: z.enum(["dhaka", "chittagong", "sylhet", "other"]).default("dhaka"),
    noise: z.enum(["quiet", "moderate", "loud"]).default("moderate"),
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
