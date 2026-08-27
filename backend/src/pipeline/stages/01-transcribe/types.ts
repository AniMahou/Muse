import { z } from "zod";
import { TranscriptSchema } from "@shared/stage-io";

/** Plain interface — `audio` is binary, not a serialisable contract. */
export interface TranscribeStageInput {
  clipId: string;
  companyId: string;
  audio: Uint8Array;
  mimeType: string;
  language?: string;
  /** The rep's brand portfolio, scoping which product names are worth biasing towards. */
  brands?: string[];
  /** Where the clip was recorded, so nearby outlet names can be biased towards. */
  geo?: { lat: number; lng: number } | null;
}

export const TranscribeStageOutputSchema = z.object({
  transcript: TranscriptSchema,
});
export type TranscribeStageOutput = z.infer<typeof TranscribeStageOutputSchema>;
