import { z } from "zod";
import type { Queue } from "bullmq";
import type { Clip } from "@shared/observation.schema";
import { ValidationError } from "@/common/errors";
import { logger } from "@/common/logger";
import type { ObservationRepository } from "@/observations/repository";
import type { IdempotencyService } from "./idempotency.service";
import type { IStorage } from "@/pipeline/ports";
import type { ProcessClipJob } from "@/queue/queues";

/**
 * Upload payload.
 *
 * Audio arrives base64-encoded inside JSON rather than as multipart. Clips are
 * ten to twenty seconds of opus — tens of kilobytes — so the ~33% encoding
 * overhead is a few kilobytes, and in exchange the PWA's offline queue stores
 * and retries a plain JSON object with no multipart assembly to redo. Revisit
 * if clips ever get long.
 */
export const UploadRequestSchema = z.object({
  /** Client-generated UUID. The idempotency key. */
  clientUuid: z.string().min(8).max(128),
  audioBase64: z.string().min(1),
  mimeType: z.string().default("audio/webm"),
  /** Captured at record time. Cannot be recovered later — the rep has moved. */
  geo: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
  /** Set when the rep confirmed the outlet in the app. */
  declaredOutletId: z.string().nullable().default(null),
  recordedAt: z.string().datetime(),
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export interface UploadResult {
  clip: Clip;
  duplicate: boolean;
}

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export class UploadService {
  constructor(
    private readonly repo: ObservationRepository,
    private readonly storage: IStorage,
    private readonly idempotency: IdempotencyService,
    private readonly queue: Queue<ProcessClipJob>,
  ) {}

  async upload(
    companyId: string,
    repId: string,
    body: unknown,
  ): Promise<UploadResult> {
    const parsed = UploadRequestSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError("invalid upload", parsed.error.issues);
    const req = parsed.data;

    const audio = Buffer.from(req.audioBase64, "base64");
    if (audio.byteLength === 0) throw new ValidationError("audio is empty");
    if (audio.byteLength > MAX_AUDIO_BYTES) throw new ValidationError("audio too large");

    // Fast path. The unique index below is the real guarantee.
    const existingClipId = await this.idempotency.lookup(companyId, req.clientUuid);
    if (existingClipId) {
      const clip = await this.repo.getClip(existingClipId);
      if (clip) return { clip, duplicate: true };
    }

    const already = await this.repo.findClipByClientUuid(companyId, req.clientUuid);
    if (already) return { clip: already, duplicate: true };

    const storageKey = `${companyId}/${req.clientUuid}.${extensionFor(req.mimeType)}`;
    await this.storage.put(storageKey, new Uint8Array(audio), req.mimeType);

    const clip = await this.repo.createClip({
      companyId,
      repId,
      clientUuid: req.clientUuid,
      storageKey,
      mimeType: req.mimeType,
      geo: req.geo,
      declaredOutletId: req.declaredOutletId,
      recordedAt: req.recordedAt,
    });

    const claimed = await this.idempotency.claim(companyId, req.clientUuid, clip.clipId);
    // createClip returns the winner of any race, so a lost claim means this
    // request was the duplicate.
    const duplicate = !claimed && clip.status !== "queued";

    if (!duplicate) {
      await this.queue.add(
        "process-clip",
        { clipId: clip.clipId, companyId, repId },
        { jobId: clip.clipId },
      );
      logger.info({ clipId: clip.clipId, bytes: audio.byteLength }, "clip queued");
    }

    return { clip, duplicate };
  }
}

/**
 * Never derive an extension from a bare type name; infer it from the full
 * MIME type. Getting this wrong makes files that no player will open.
 */
function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
  };
  return map[mimeType.split(";")[0]!.trim().toLowerCase()] ?? "bin";
}
