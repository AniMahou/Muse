import { Router, type Request, type Response, type NextFunction } from "express";
import { AppError } from "@/common/errors";
import type { Container } from "@/container";
import type { UploadService } from "./upload.service";
import { repAuth } from "./auth.middleware";

export function ingestRoutes(container: Container, uploads: UploadService): Router {
  const router = Router();
  // Per-route rather than router.use: this router is mounted at /api, so a
  // router-wide guard would also reject /api/admin/* before the admin router
  // is ever reached.
  const auth = repAuth(container.collections);

  /**
   * POST /observations — accept one recording.
   *
   * Returns 202 rather than 200: the clip is accepted and queued, not
   * processed. The rep's app must never block on transcription; he is walking
   * to the next shop.
   *
   * A repeated clientUuid returns 200 with the original clip instead of an
   * error, because a duplicate upload is normal operation — the offline queue
   * retries — not a client mistake.
   */
  router.post("/observations", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rep = req.rep;
      if (!rep) throw new AppError("unauthenticated", 401, "unauthenticated");

      const { clip, duplicate } = await uploads.upload(rep.companyId, rep.repId, req.body);
      res.status(duplicate ? 200 : 202).json({
        clipId: clip.clipId,
        status: clip.status,
        duplicate,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Lets the app show a clip moving through the pipeline. */
  router.get("/clips/:clipId", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rep = req.rep;
      if (!rep) throw new AppError("unauthenticated", 401, "unauthenticated");

      const clip = await container.repo.getClip(req.params.clipId ?? "");
      if (!clip || clip.companyId !== rep.companyId) {
        throw new AppError("clip not found", 404, "not_found");
      }
      res.json({
        clipId: clip.clipId,
        status: clip.status,
        observationCount: clip.observationCount,
        transcriptText: clip.transcriptText,
        error: clip.error,
        // Reported, not assumed. The app used to hard-code a "SIMULATED OCR"
        // badge, which was honest while the mock was the only implementation
        // and became a lie the moment the trained recogniser was wired in —
        // in the direction that matters least, but a UI that states a fact it
        // does not check will eventually state it wrongly the other way.
        simulated: clip.pipeline?.simulated ?? false,
        extractor: clip.pipeline?.extractor ?? null,
        extractorModel: clip.pipeline?.extractorModel ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
