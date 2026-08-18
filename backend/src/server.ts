import { createServer } from "node:http";
import { config } from "@/common/config";
import { logger } from "@/common/logger";
import { connectMongo, ensureIndexes, closeMongo } from "@/db/client";
import { buildContainer } from "@/container";
import { UploadService } from "@/ingest/upload.service";
import { makeQueue, CLIP_QUEUE, type ProcessClipJob } from "@/queue/queues";
import { buildApp } from "@/app";

/**
 * API entrypoint.
 *
 * Runs separately from the worker so that transcription load can never make
 * the upload endpoint unresponsive — a rep in a shop must always be able to
 * hand off a recording in under a second, whatever the queue is doing.
 */
async function main(): Promise<void> {
  const db = await connectMongo();
  await ensureIndexes(db);

  const container = buildContainer(db);
  const queue = makeQueue<ProcessClipJob>(CLIP_QUEUE);
  const uploads = new UploadService(
    container.repo,
    container.storage,
    container.idempotency,
    queue,
  );

  const app = buildApp(container, uploads);
  const server = createServer(app);
  container.realtime.attach(server);

  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, "muse api listening");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down api");
    server.close();
    await container.realtime.close();
    await queue.close();
    await container.close();
    await closeMongo();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "api failed to start");
  process.exit(1);
});
