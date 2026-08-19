import { logger } from "@/common/logger";
import { connectMongo, closeMongo } from "@/db/client";
import { buildContainer } from "@/container";
import {
  makeWorker,
  CLIP_QUEUE,
  CLARIFY_QUEUE,
  type ProcessClipJob,
  type ClarificationTimeoutJob,
} from "@/queue/queues";
import { makeProcessClip } from "@/queue/processors/process-clip";

/**
 * Worker entrypoint.
 *
 * A separate process from the API, sharing the same container builder. Scales
 * independently: transcription is the slow, metered part of the system, and
 * the number of processes doing it should not be coupled to the number
 * accepting uploads.
 */
async function main(): Promise<void> {
  const db = await connectMongo();
  const container = buildContainer(db);

  const worker = makeWorker<ProcessClipJob>(CLIP_QUEUE, makeProcessClip(container));

  // Each clarification schedules its own delayed job at creation, which is why
  // there is no sweeper anywhere: a prompt cannot pile up unresolved, because
  // its resolution was scheduled the moment it existed.
  const clarifyWorker = makeWorker<ClarificationTimeoutJob>(CLARIFY_QUEUE, async (job) => {
    await container.clarifications.autoResolve(job.data.clarificationId);
  });

  worker.on("completed", (job) => logger.debug({ jobId: job.id }, "job completed"));
  worker.on("failed", (job, err) =>
    logger.warn({ jobId: job?.id, err: err.message }, "job failed"),
  );

  logger.info({ queues: [CLIP_QUEUE, CLARIFY_QUEUE] }, "muse worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down worker");
    await worker.close();
    await clarifyWorker.close();
    await container.close();
    await closeMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
