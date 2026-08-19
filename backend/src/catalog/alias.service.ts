import { randomUUID } from "node:crypto";
import type { SkuAnnotation } from "@shared/stage-io";
import type { AliasCandidate } from "@shared/clarification.schema";
import type { Alias } from "@shared/catalog";
import type { Collections } from "@/db/client";
import { NotFoundError, ValidationError } from "@/common/errors";
import { logger } from "@/common/logger";

export interface AliasCandidateOptions {
  /** Score below which a match is too weak to suggest at all. */
  minScore?: number;
  /** Margin below which a match is ambiguous and worth a human decision. */
  ambiguousBelow?: number;
  /** Sample clips retained per candidate, so a reviewer can listen. */
  maxSamples?: number;
}

/**
 * The learning loop.
 *
 * Every uncertain product match is recorded here as a surface form with a
 * count. An admin approves the good ones once, an Alias row is written, and
 * stage 3 stops being uncertain about that word — permanently, for every rep
 * in the company.
 *
 * This is what makes review work worth doing. Without it, correcting records
 * is a cleanup chore that never ends; with it, each correction removes a class
 * of future error.
 */
export class AliasService {
  private readonly minScore: number;
  private readonly ambiguousBelow: number;
  private readonly maxSamples: number;

  constructor(
    private readonly c: Collections,
    opts: AliasCandidateOptions = {},
  ) {
    this.minScore = opts.minScore ?? 0.5;
    this.ambiguousBelow = opts.ambiguousBelow ?? 0.2;
    this.maxSamples = opts.maxSamples ?? 5;
  }

  /**
   * Harvest candidates from one clip's product annotations.
   *
   * Two things qualify: a form that matched nothing well enough to be sure,
   * and a form whose top two candidates are too close to separate. Both are
   * cases where a single human decision permanently removes the doubt.
   */
  async recordFrom(
    companyId: string,
    clipId: string,
    annotations: SkuAnnotation[],
    now = new Date(),
  ): Promise<number> {
    let recorded = 0;

    for (const ann of annotations) {
      const top = ann.candidates[0];
      if (!top) continue;

      // Already resolved through an approved alias: nothing to learn.
      if (top.viaAlias) continue;

      const weak = top.score < this.minScore + 0.25;
      const ambiguous = ann.margin < this.ambiguousBelow;
      if (!weak && !ambiguous) continue;
      if (top.score < this.minScore) continue;

      const surface = ann.raw.trim();
      if (surface.length === 0) continue;

      await this.c.aliasCandidates.updateOne(
        { companyId, surface },
        {
          $setOnInsert: {
            candidateId: `alc_${randomUUID()}`,
            companyId,
            surface,
            status: "pending" as const,
            resolvedSkuId: null,
            reviewedBy: null,
            reviewedAt: null,
            firstSeenAt: now.toISOString(),
          },
          $set: {
            suggestedSkuId: top.skuId,
            suggestedName: top.name,
            bestScore: top.score,
            bestMargin: ann.margin,
            lastSeenAt: now.toISOString(),
          },
          $inc: { occurrences: 1 },
          // Capped: a reviewer needs a few examples to judge, not hundreds.
          $push: { sampleClipIds: { $each: [clipId], $slice: -this.maxSamples } },
        },
        { upsert: true },
      );
      recorded++;
    }

    return recorded;
  }

  /** Approval queue, most-heard first — frequency is the best proxy for value. */
  async pending(companyId: string, limit = 50): Promise<AliasCandidate[]> {
    return this.c.aliasCandidates
      .find({ companyId, status: "pending" })
      .sort({ occurrences: -1, lastSeenAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Approve a candidate, optionally overriding which SKU it maps to.
   *
   * The override matters: the resolver's suggestion is a guess, and the whole
   * point of a human in this loop is that they can say "no, that word means
   * this OTHER product" — which no amount of phonetic similarity would find.
   */
  async approve(
    companyId: string,
    candidateId: string,
    reviewedBy: string,
    skuIdOverride?: string,
  ): Promise<Alias> {
    const cand = await this.c.aliasCandidates.findOne({ companyId, candidateId });
    if (!cand) throw new NotFoundError("alias candidate");
    if (cand.status !== "pending") throw new ValidationError("already reviewed");

    const skuId = skuIdOverride ?? cand.suggestedSkuId;
    if (!skuId) throw new ValidationError("no SKU to map this surface form to");

    const sku = await this.c.skus.findOne({ companyId, skuId });
    if (!sku) throw new NotFoundError(`sku ${skuId}`);

    const now = new Date().toISOString();
    const alias: Alias = {
      aliasId: `al_${randomUUID()}`,
      companyId,
      skuId,
      surface: cand.surface,
      source: "admin_approved",
      approvedBy: reviewedBy,
      approvedAt: now,
    };

    await this.c.aliases.updateOne(
      { companyId, surface: alias.surface, skuId },
      { $set: alias },
      { upsert: true },
    );
    await this.c.aliasCandidates.updateOne(
      { candidateId },
      { $set: { status: "approved", resolvedSkuId: skuId, reviewedBy, reviewedAt: now } },
    );

    logger.info({ surface: alias.surface, skuId }, "alias approved");
    return alias;
  }

  async reject(companyId: string, candidateId: string, reviewedBy: string): Promise<void> {
    const res = await this.c.aliasCandidates.updateOne(
      { companyId, candidateId, status: "pending" },
      { $set: { status: "rejected", reviewedBy, reviewedAt: new Date().toISOString() } },
    );
    if (res.matchedCount === 0) throw new NotFoundError("pending alias candidate");
  }
}
