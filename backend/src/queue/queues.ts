import { Queue, Worker, type ConnectionOptions, type Processor } from "bullmq";
import { config } from "@/common/config";

export const CLIP_QUEUE = "process-clip";
export const CLARIFY_QUEUE = "clarification-timeout";

export interface ProcessClipJob {
  clipId: string;
  companyId: string;
  repId: string;
}

export interface ClarificationTimeoutJob {
  clarificationId: string;
  companyId: string;
}

export function connection(): ConnectionOptions {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: url.password } : {}),
  };
}

export function makeQueue<T>(name: string): Queue<T> {
  return new Queue<T>(name, {
    connection: connection(),
    prefix: config.queuePrefix,
    defaultJobOptions: {
      attempts: config.queueMaxAttempts,
      backoff: { type: "exponential", delay: config.queueBackoffMs },
      // Keep completed jobs briefly so Bull Board shows recent throughput;
      // keep failures far longer, since they are the ones worth reading.
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
}

export function makeWorker<T>(name: string, processor: Processor<T>): Worker<T> {
  return new Worker<T>(name, processor, {
    connection: connection(),
    prefix: config.queuePrefix,
    concurrency: config.queueConcurrency,
  });
}
