import type { Job } from "bullmq";
import { logger } from "@/common/logger";
import { ProviderError } from "@/common/errors";
import type { Container } from "@/container";
import type { ProcessClipJob } from "../queues";

/**
 * Runs one clip through the pipeline and persists the result.
 *
 * Retries are BullMQ's job, not this function's — it either succeeds or
 * throws. The one distinction it does draw is retryable versus not: a rate
 * limit deserves another attempt, a malformed request will fail identically
 * forever and should stop consuming the queue.
 */
export function makeProcessClip(container: Container) {
  return async function processClip(job: Job<ProcessClipJob>): Promise<void> {
    const { clipId, companyId } = job.data;
    const started = Date.now();

    const clip = await container.repo.getClip(clipId);
    if (!clip) {
      logger.warn({ clipId }, "clip vanished before processing");
      return;
    }

    await container.repo.setClipStatus(clipId, "processing");
    container.realtime.clipStatus(companyId, { clipId, status: "processing" });

    try {
      // The rep's brand portfolio scopes the SKU candidate set — it is what
      // keeps matching accurate as a catalogue grows into the thousands.
      const rep = await container.collections.reps.findOne({ repId: clip.repId });
      const orchestrator = container.buildOrchestrator(
        rep?.brandPortfolio?.length ? { brands: rep.brandPortfolio } : {},
      );

      const result = await orchestrator.run({
        clipId: clip.clipId,
        companyId: clip.companyId,
        repId: clip.repId,
        storageKey: clip.storageKey,
        mimeType: clip.mimeType,
        geo: clip.geo,
        declaredOutletId: clip.declaredOutletId,
        recordedAt: clip.recordedAt,
      });

      const saved = await container.repo.replaceForClip(clip, result.observations);

      await container.repo.setClipStatus(clipId, "processed", {
        transcriptText: result.transcript.text,
        durationSec: result.transcript.durationSec,
        observationCount: saved.length,
        error: null,
      });

      // Turn flagged fields into one-tap questions, and harvest surface forms
      // the resolver was unsure about for the alias approval queue. Both are
      // the learning loop: a rep answers once, an admin approves once, and the
      // system stops being uncertain about that thing.
      let prompts = 0;
      for (const obs of saved) {
        if (obs.flaggedFields.length === 0) continue;
        const created = await container.clarifications.createFor(obs, result.annotations);
        prompts += created.length;
      }
      const aliasCandidates = await container.aliases.recordFrom(
        companyId,
        clipId,
        result.annotations.skus,
      );

      container.realtime.clipStatus(companyId, { clipId, status: "processed" });
      container.realtime.observationsCreated(companyId, saved);

      logger.info(
        {
          clipId,
          observations: saved.length,
          flagged: saved.filter((o) => o.status === "needs_clarification").length,
          prompts,
          aliasCandidates,
          ms: Date.now() - started,
          cacheHits: result.cacheHits,
        },
        "clip processed",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = !(err instanceof ProviderError) || err.retryable;
      const attemptsLeft = (job.opts.attempts ?? 1) - job.attemptsMade - 1;

      logger.error({ clipId, err: message, retryable, attemptsLeft }, "clip processing failed");

      // Only mark the clip failed once there is no attempt left, so a
      // transient rate limit does not surface to the dashboard as a failure.
      if (!retryable || attemptsLeft <= 0) {
        await container.repo.setClipStatus(clipId, "failed", { error: message });
        container.realtime.clipStatus(companyId, { clipId, status: "failed", error: message });
      }

      if (!retryable) return; // swallow: retrying cannot help
      throw err;
    }
  };
}
