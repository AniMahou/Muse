import { z } from "zod";
import { TranscriptSchema } from "@shared/stage-io";

/** Plain interface — `audio` is binary, not a serialisable contract. */
export interface TranscribeStageInput {
  clipId: string;
  audio: Uint8Array;
  mimeType: string;
  language?: string;
}

export const TranscribeStageOutputSchema = z.object({
  transcript: TranscriptSchema,
});
export type TranscribeStageOutput = z.infer<typeof TranscribeStageOutputSchema>;
