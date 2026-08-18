import { z } from "zod";
import { TranscriptSchema } from "@shared/stage-io";

export const TranscribeStageInputSchema = z.object({
  clipId: z.string(),
  audio: z.instanceof(Uint8Array),
  mimeType: z.string(),
  language: z.string().optional(),
});
export type TranscribeStageInput = z.infer<typeof TranscribeStageInputSchema>;

export const TranscribeStageOutputSchema = z.object({
  transcript: TranscriptSchema,
});
export type TranscribeStageOutput = z.infer<typeof TranscribeStageOutputSchema>;
