import { promises as fs } from "node:fs";
import path from "node:path";
import { stableHash } from "@/common/hash";

/**
 * Content-addressed cache of stage outputs.
 *
 * Built for the evaluation loop. Re-running a hundred clips after touching
 * only stage 6 should cost one stage, not six — and in particular should not
 * re-pay for ASR and the assembly call, which are the slow and metered parts.
 *
 * The key deliberately includes the provider and model alongside the stage
 * version and the input. Omitting them is the subtle failure: switch ASR
 * provider, get a cache hit from the old one, and score stale results while
 * believing the new provider produced them.
 */
export class StageCache {
  constructor(
    private readonly dir: string,
    private readonly enabled: boolean,
  ) {}

  key(stage: string, version: string, input: unknown): string {
    return `${stage}.${version}.${stableHash(input)}`;
  }

  private fileFor(key: string): string {
    // Shard by the first two hex characters so a directory never holds
    // hundreds of thousands of entries.
    const hash = key.slice(key.lastIndexOf(".") + 1);
    return path.join(this.dir, hash.slice(0, 2), `${key}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      return JSON.parse(await fs.readFile(this.fileFor(key), "utf8")) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    if (!this.enabled) return;
    const file = this.fileFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Write-then-rename, so a crash mid-write cannot leave a truncated entry
    // that later parses as valid JSON.
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value), "utf8");
    await fs.rename(tmp, file);
  }

  /** Run `compute` unless a cached value exists. Returns whether it was a hit. */
  async wrap<T>(key: string, compute: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
    const hit = await this.get<T>(key);
    if (hit !== null) return { value: hit, cached: true };
    const value = await compute();
    await this.set(key, value);
    return { value, cached: false };
  }
}
