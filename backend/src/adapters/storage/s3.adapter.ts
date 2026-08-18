import type { IStorage } from "@/pipeline/ports";

/**
 * Deliberately unimplemented.
 *
 * The port exists so that swapping object storage in later is a one-file
 * change. Building it now would be speculative work: the demo runs on local
 * disk, and the production driver a customer wants depends on where they host
 * — S3, R2, or their own MinIO. Throwing loudly beats a half-tested stub that
 * looks available.
 */
export class S3Storage implements IStorage {
  readonly name = "s3";

  constructor(private readonly cfg: { bucket: string; region: string; endpoint?: string }) {}

  private unimplemented(): never {
    throw new Error(
      `S3Storage is not implemented (bucket "${this.cfg.bucket}"). ` +
        `Set STORAGE_DRIVER=local, or implement this adapter against the IStorage port.`,
    );
  }

  async put(): Promise<void> {
    this.unimplemented();
  }
  async get(): Promise<Uint8Array> {
    this.unimplemented();
  }
  async exists(): Promise<boolean> {
    this.unimplemented();
  }
  async remove(): Promise<void> {
    this.unimplemented();
  }
}
