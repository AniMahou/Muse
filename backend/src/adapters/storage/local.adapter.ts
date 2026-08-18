import { promises as fs } from "node:fs";
import path from "node:path";
import type { IStorage } from "@/pipeline/ports";

/**
 * Filesystem-backed audio storage.
 *
 * The correct driver for development and for the demo — a hundred clips is
 * about four megabytes. It is also the mode to run when an enterprise asks
 * about data residency: combined with the local ASR adapter, field audio
 * never leaves the customer's own infrastructure.
 */
export class LocalStorage implements IStorage {
  readonly name = "local";

  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    // Refuse to escape the base directory.
    const full = path.resolve(this.baseDir, key);
    const base = path.resolve(this.baseDir);
    if (!full.startsWith(base + path.sep) && full !== base) {
      throw new Error(`Storage key escapes base directory: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Uint8Array, _contentType: string): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.resolve(key)));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/** In-memory storage for tests. No disk, no cleanup. */
export class MemoryStorage implements IStorage {
  readonly name = "memory";
  private readonly files = new Map<string, Uint8Array>();

  async put(key: string, data: Uint8Array, _contentType?: string): Promise<void> {
    this.files.set(key, data);
  }
  async get(key: string): Promise<Uint8Array> {
    const f = this.files.get(key);
    if (!f) throw new Error(`MemoryStorage: no such key "${key}"`);
    return f;
  }
  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
}
