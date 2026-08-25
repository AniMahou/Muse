/**
 * Audio container names, in both directions.
 *
 * Transcription APIs identify the container from the upload's *filename*, not
 * only from its declared content type, so a provider handed wav bytes under a
 * `.webm` name can reject a perfectly good recording. The two places that need
 * this — the ASR adapters, which name the upload, and the evaluation harness,
 * which reads clips off disk — must agree, so the mapping lives once.
 */
const BY_MIME: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
};

const BY_EXT: Record<string, string> = {
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
};

/** File extension for a content type. Falls back to webm, what the PWA records. */
export function extensionForMime(mimeType: string): string {
  return BY_MIME[mimeType.split(";")[0]!.trim().toLowerCase()] ?? ".webm";
}

/** Content type for a file extension. Falls back to webm, what the PWA records. */
export function mimeForExtension(ext: string): string {
  return BY_EXT[ext.toLowerCase()] ?? "audio/webm";
}
