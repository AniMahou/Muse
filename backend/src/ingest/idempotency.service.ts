import type Redis from "ioredis";

/**
 * First line of defence against duplicate uploads.
 *
 * The PWA queues recordings offline and retries on reconnect, and BullMQ is
 * at-least-once, so duplicates are certain rather than hypothetical. Redis
 * SET NX answers in under a millisecond and avoids a Mongo round trip on the
 * hot path — but the unique index on (companyId, clientUuid) is the actual
 * guarantee. This is the fast path, not the correctness argument.
 */
export class IdempotencyService {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = 24 * 60 * 60,
  ) {}

  private key(companyId: string, clientUuid: string): string {
    return `muse:idem:${companyId}:${clientUuid}`;
  }

  /** Claim this clientUuid. Returns false when someone already has it. */
  async claim(companyId: string, clientUuid: string, clipId: string): Promise<boolean> {
    const res = await this.redis.set(
      this.key(companyId, clientUuid),
      clipId,
      "EX",
      this.ttlSeconds,
      "NX",
    );
    return res === "OK";
  }

  async lookup(companyId: string, clientUuid: string): Promise<string | null> {
    return this.redis.get(this.key(companyId, clientUuid));
  }

  async release(companyId: string, clientUuid: string): Promise<void> {
    await this.redis.del(this.key(companyId, clientUuid));
  }
}
