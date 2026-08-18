import { randomUUID } from "node:crypto";
import type { Clip, ClipStatus, Observation } from "@shared/observation.schema";
import type { ScoredObservation } from "@shared/stage-io";
import type { Collections } from "@/db/client";

export interface CreateClipInput {
  companyId: string;
  repId: string;
  clientUuid: string;
  storageKey: string;
  mimeType: string;
  geo: { lat: number; lng: number } | null;
  declaredOutletId: string | null;
  recordedAt: string;
}

export class ObservationRepository {
  constructor(private readonly c: Collections) {}

  // -- clips ---------------------------------------------------------------

  async findClipByClientUuid(companyId: string, clientUuid: string): Promise<Clip | null> {
    return this.c.clips.findOne({ companyId, clientUuid });
  }

  async createClip(input: CreateClipInput): Promise<Clip> {
    const now = new Date().toISOString();
    const clip: Clip = {
      clipId: `clip_${randomUUID()}`,
      ...input,
      durationSec: null,
      status: "queued",
      error: null,
      transcriptText: null,
      observationCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.c.clips.insertOne(clip);
      return clip;
    } catch (err) {
      // Lost a race against a concurrent duplicate. The unique index is the
      // real guarantee behind the Redis fast path, so honour whoever won.
      if (isDuplicateKey(err)) {
        const existing = await this.findClipByClientUuid(input.companyId, input.clientUuid);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async setClipStatus(
    clipId: string,
    status: ClipStatus,
    patch: Partial<Pick<Clip, "error" | "transcriptText" | "durationSec" | "observationCount">> = {},
  ): Promise<void> {
    await this.c.clips.updateOne(
      { clipId },
      { $set: { status, updatedAt: new Date().toISOString(), ...patch } },
    );
  }

  async getClip(clipId: string): Promise<Clip | null> {
    return this.c.clips.findOne({ clipId });
  }

  // -- observations --------------------------------------------------------

  /**
   * Persist a clip's observations.
   *
   * Replaces rather than appends, so a reprocessed clip does not duplicate its
   * output — reprocessing happens whenever the pipeline improves and old audio
   * is run again.
   */
  async replaceForClip(
    clip: Pick<Clip, "clipId" | "companyId" | "repId" | "recordedAt">,
    scored: ScoredObservation[],
  ): Promise<Observation[]> {
    await this.c.observations.deleteMany({ clipId: clip.clipId });
    if (scored.length === 0) return [];

    const now = new Date().toISOString();
    const docs: Observation[] = scored.map((s) => ({
      ...s,
      observationId: `obs_${randomUUID()}`,
      clipId: clip.clipId,
      companyId: clip.companyId,
      repId: clip.repId,
      recordedAt: clip.recordedAt,
      createdAt: now,
      updatedAt: now,
    }));

    await this.c.observations.insertMany(docs);
    return docs;
  }

  async listForCompany(
    companyId: string,
    opts: { status?: Observation["status"]; limit?: number } = {},
  ): Promise<Observation[]> {
    return this.c.observations
      .find({ companyId, ...(opts.status ? { status: opts.status } : {}) })
      .sort({ createdAt: -1 })
      .limit(Math.min(opts.limit ?? 100, 500))
      .toArray();
  }

  async getObservation(observationId: string): Promise<Observation | null> {
    return this.c.observations.findOne({ observationId });
  }

  async patchObservation(
    observationId: string,
    patch: Partial<Observation>,
  ): Promise<Observation | null> {
    const res = await this.c.observations.findOneAndUpdate(
      { observationId },
      { $set: { ...patch, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    );
    return res ?? null;
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}
