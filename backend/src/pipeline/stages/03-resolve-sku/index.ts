import type { Alias, Sku } from "@shared/catalog";
import type { SkuAnnotation, SkuCandidate, Transcript } from "@shared/stage-io";
import type { ICatalogRepo } from "@/pipeline/ports";
import { tokenize, spansOverlap, type Token } from "@/common/text";
import { phoneticKey, phoneticSimilarity } from "@/common/bangla-phonetic";
import type { SkuResolverOptions, SkuStageInput, SkuStageOutput } from "./types";

/** Pack-size tokens ("250ml", "1l", "80g") are usually not spoken aloud. */
const PACK_TOKEN = /^\d+(?:ml|l|g|kg|gm|ltr|pcs)?$/i;

interface IndexedSku {
  sku: Sku;
  /** Phonetic keys of the name's content words, pack sizes excluded. */
  coreKeys: string[];
  /** Phonetic keys of pack tokens; matched for bonus, never required. */
  packKeys: string[];
  brandKey: string;
}

interface IndexedAlias {
  alias: Alias;
  key: string;
}

interface Hit {
  span: [number, number];
  raw: string;
  candidate: SkuCandidate;
  windowLength: number;
}

/**
 * Stage 3 — resolve spoken product mentions against the catalogue.
 *
 * This stage is why a 30% word error rate does not become a 30% data error
 * rate. It never asks "is the transcript correct"; it asks "which known
 * product does this sound most like", against a closed set. প্রান and প্রাণ
 * and "PRAN" all reduce to the same phonetic key, so the ASR being wrong on
 * the page costs nothing.
 *
 * It emits CANDIDATES, not decisions. Stage 5 picks from what is offered here
 * and cannot invent anything outside it; stage 6 uses the margin between the
 * top two to judge whether the choice was actually safe.
 */
export class SkuResolverStage {
  readonly name = "03-resolve-sku";

  private readonly minScore: number;
  private readonly maxCandidates: number;
  private readonly maxWindow: number;
  private readonly aliasBoost: number;

  constructor(
    private readonly catalog: ICatalogRepo,
    opts: SkuResolverOptions = {},
  ) {
    this.minScore = opts.minScore ?? 0.55;
    this.maxCandidates = opts.maxCandidates ?? 5;
    this.maxWindow = opts.maxWindow ?? 4;
    this.aliasBoost = opts.aliasBoost ?? 1.15;
  }

  async run(input: SkuStageInput): Promise<SkuStageOutput> {
    const [skus, aliases] = await Promise.all([
      this.catalog.listSkus({
        companyId: input.companyId,
        ...(input.brands ? { brands: input.brands } : {}),
        includeCompetitors: true,
      }),
      this.catalog.listAliases(input.companyId),
    ]);

    if (skus.length === 0) return { skus: [] };

    const index = buildIndex(skus);
    const aliasIndex = buildAliasIndex(aliases, skus);
    const tokens = tokenize(input.transcript.text);

    const hits = this.collectHits(tokens, input.transcript, index, aliasIndex);
    return { skus: this.resolveOverlaps(hits) };
  }

  // -------------------------------------------------------------------------

  private collectHits(
    tokens: Token[],
    transcript: Transcript,
    index: IndexedSku[],
    aliasIndex: Map<string, IndexedAlias[]>,
  ): Map<string, Hit[]> {
    const bySpan = new Map<string, Hit[]>();

    const push = (hit: Hit) => {
      const k = `${hit.span[0]}:${hit.span[1]}`;
      const list = bySpan.get(k);
      if (list) list.push(hit);
      else bySpan.set(k, [hit]);
    };

    for (let start = 0; start < tokens.length; start++) {
      for (let len = 1; len <= this.maxWindow && start + len <= tokens.length; len++) {
        const window = tokens.slice(start, start + len);
        const first = window[0];
        const last = window[window.length - 1];
        if (!first || !last) continue;

        const span: [number, number] = [first.span[0], last.span[1]];
        const raw = transcript.text.slice(span[0], span[1]);
        const windowKeys = window.map((t) => phoneticKey(t.text)).filter((k) => k.length > 0);
        if (windowKeys.length === 0) continue;

        // Approved aliases are checked first and separately: they are a human
        // decision, not a similarity guess.
        if (len === 1) {
          const key = windowKeys[0]!;
          for (const entry of aliasIndex.get(key) ?? []) {
            const sku = entry.alias;
            const target = index.find((i) => i.sku.skuId === sku.skuId);
            if (!target) continue;
            push({
              span,
              raw,
              windowLength: len,
              candidate: {
                skuId: target.sku.skuId,
                name: target.sku.name,
                brand: target.sku.brand,
                isCompetitor: target.sku.isCompetitor,
                score: Math.min(1, this.aliasBoost),
                viaAlias: entry.alias.surface,
              },
            });
          }
        }

        for (const entry of index) {
          const score = scoreWindow(windowKeys, entry);
          if (score < this.minScore) continue;
          push({
            span,
            raw,
            windowLength: len,
            candidate: {
              skuId: entry.sku.skuId,
              name: entry.sku.name,
              brand: entry.sku.brand,
              isCompetitor: entry.sku.isCompetitor,
              score: round(score),
              viaAlias: null,
            },
          });
        }
      }
    }

    return bySpan;
  }

  /**
   * Turn per-span hit lists into annotations, keeping the strongest
   * non-overlapping set.
   *
   * Longer windows win ties, because "PRAN Mango Juice" spoken in full is a
   * more specific mention than the word "Mango" on its own, and a longer span
   * subsumes the shorter one's evidence.
   */
  private resolveOverlaps(bySpan: Map<string, Hit[]>): SkuAnnotation[] {
    const perSpan: SkuAnnotation[] = [];

    for (const hits of bySpan.values()) {
      const bySku = new Map<string, Hit>();
      for (const h of hits) {
        const prev = bySku.get(h.candidate.skuId);
        if (!prev || h.candidate.score > prev.candidate.score) bySku.set(h.candidate.skuId, h);
      }
      const ranked = [...bySku.values()].sort((a, b) => b.candidate.score - a.candidate.score);
      const top = ranked[0];
      if (!top) continue;

      const candidates = ranked.slice(0, this.maxCandidates).map((h) => h.candidate);
      const second = candidates[1];
      perSpan.push({
        span: top.span,
        raw: top.raw,
        candidates,
        margin: round(candidates[0]!.score - (second?.score ?? 0)),
      });
    }

    // Greedy selection: strongest first, then longest, dropping anything that
    // overlaps something already taken.
    perSpan.sort((a, b) => {
      const ds = (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0);
      if (Math.abs(ds) > 1e-9) return ds;
      return b.span[1] - b.span[0] - (a.span[1] - a.span[0]);
    });

    const kept: SkuAnnotation[] = [];
    for (const ann of perSpan) {
      if (kept.some((k) => spansOverlap(k.span, ann.span))) continue;
      kept.push(ann);
    }

    return kept.sort((a, b) => a.span[0] - b.span[0]);
  }
}

// ---------------------------------------------------------------------------

function buildIndex(skus: Sku[]): IndexedSku[] {
  return skus.map((sku) => {
    const parts = `${sku.name} ${sku.pack ?? ""}`.split(/\s+/).filter(Boolean);
    const coreKeys: string[] = [];
    const packKeys: string[] = [];
    for (const p of parts) {
      const key = phoneticKey(p);
      if (key.length === 0) continue;
      if (PACK_TOKEN.test(p)) packKeys.push(key);
      else coreKeys.push(key);
    }
    return { sku, coreKeys, packKeys, brandKey: phoneticKey(sku.brand.replace(/\s+/g, "")) };
  });
}

function buildAliasIndex(aliases: Alias[], skus: Sku[]): Map<string, IndexedAlias[]> {
  const known = new Set(skus.map((s) => s.skuId));
  const map = new Map<string, IndexedAlias[]>();
  for (const alias of aliases) {
    // An alias pointing at a SKU outside this rep's scope is not a match.
    if (!known.has(alias.skuId)) continue;
    const key = phoneticKey(alias.surface);
    if (key.length === 0) continue;
    const list = map.get(key);
    if (list) list.push({ alias, key });
    else map.set(key, [{ alias, key }]);
  }
  return map;
}

/**
 * Score one transcript window against one catalogue entry, 0..1.
 *
 * Two independent routes to a match, and the better one wins:
 *
 *   NAME   how much of the product's full catalogue name the window accounts
 *          for, weighted by how much of the window the product accounts for.
 *          Pack sizes are excluded from the requirement — reps say "PRAN
 *          mango juice", almost never "...two fifty millilitre" — but a
 *          spoken pack size still earns a bonus, since it discriminates
 *          between variants of one product.
 *
 *   BRAND  a match on the brand alone. Catalogue names are formal SKU
 *          descriptions ("Harpic Toilet Cleaner") while speech is colloquial
 *          ("হারপিক"). Requiring the full name would score a perfectly clear
 *          mention at 1/3 and discard it.
 *
 * The brand route is capped below a full name match on purpose. When a rep
 * says only "প্রাণ", every PRAN product scores the same and the MARGIN
 * collapses to zero — which is the correct reading. The mention really is
 * ambiguous, and stage 6 should flag it rather than have this stage invent a
 * winner.
 */
const BRAND_ONLY_CAP = 0.85;

function scoreWindow(windowKeys: string[], entry: IndexedSku): number {
  return Math.max(scoreByName(windowKeys, entry), scoreByBrand(windowKeys, entry));
}

function scoreByName(windowKeys: string[], entry: IndexedSku): number {
  if (entry.coreKeys.length === 0) return 0;

  let recallSum = 0;
  const usedWindow = new Set<number>();

  for (const coreKey of entry.coreKeys) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < windowKeys.length; i++) {
      const sim = phoneticSimilarity(coreKey, windowKeys[i]!);
      if (sim > best) {
        best = sim;
        bestIdx = i;
      }
    }
    // Below this a token contributes nothing. Near-misses on every word must
    // not accumulate into a confident match.
    if (best >= 0.7 && bestIdx >= 0) {
      recallSum += best;
      usedWindow.add(bestIdx);
    }
  }

  const recall = recallSum / entry.coreKeys.length;
  if (recall === 0) return 0;

  let packBonus = 0;
  for (const packKey of entry.packKeys) {
    for (let i = 0; i < windowKeys.length; i++) {
      if (phoneticSimilarity(packKey, windowKeys[i]!) >= 0.9) {
        packBonus = 0.08;
        usedWindow.add(i);
        break;
      }
    }
  }

  return Math.min(1, recall * (0.55 + 0.45 * (usedWindow.size / windowKeys.length)) + packBonus);
}

function scoreByBrand(windowKeys: string[], entry: IndexedSku): number {
  if (entry.brandKey.length === 0 || windowKeys.length === 0) return 0;

  // Brands are stored space-stripped ("Surf Excel" -> surfeksel) because a
  // multi-word brand arrives as several transcript tokens. Compare against
  // each token on its own AND against the whole window joined, so both
  // "লাক্স" and "সার্ফ এক্সেল" reach their brand.
  let best = 0;
  let matchedTokens = 1;

  for (const key of windowKeys) {
    const sim = phoneticSimilarity(entry.brandKey, key);
    if (sim > best) {
      best = sim;
      matchedTokens = 1;
    }
  }

  if (windowKeys.length > 1) {
    const joined = phoneticSimilarity(entry.brandKey, windowKeys.join(""));
    if (joined > best) {
      best = joined;
      matchedTokens = windowKeys.length;
    }
  }

  if (best < 0.85) return 0;

  const coverage = matchedTokens / windowKeys.length;
  return Math.min(BRAND_ONLY_CAP, best * (0.55 + 0.45 * coverage) * BRAND_ONLY_CAP);
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
