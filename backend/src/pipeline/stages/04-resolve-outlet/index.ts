import type { Outlet } from "@shared/catalog";
import type { OutletCandidate, OutletResolution } from "@shared/stage-io";
import type { IOutletRepo } from "@/pipeline/ports";
import { tokenize } from "@/common/text";
import { phoneticKey, phoneticSimilarity } from "@/common/bangla-phonetic";
import { haversineMeters, proximityScore } from "@/common/geo";
import type { OutletResolverOptions, OutletStageInput, OutletStageOutput } from "./types";

/**
 * Stage 4 — decide which shop the rep is standing in.
 *
 * Neither signal works alone. Consumer GPS in a dense Dhaka market is good to
 * roughly 10-30 metres and a market holds a dozen shops inside that error, so
 * position narrows but cannot identify. A spoken name like "বিজয় স্টোর" is
 * ambiguous across the whole city, so the name discriminates but cannot
 * locate. Together they are usually decisive — and when they are not, the
 * margin says so and stage 6 asks the rep a one-tap question.
 */
export class OutletResolverStage {
  readonly name = "04-resolve-outlet";

  private readonly radiusM: number;
  private readonly maxCandidates: number;
  private readonly maxWindow: number;
  private readonly nameConfidentAt: number;
  private readonly nameFloor: number;
  private readonly maxNameWeight: number;

  constructor(
    private readonly outlets: IOutletRepo,
    opts: OutletResolverOptions = {},
  ) {
    this.radiusM = opts.radiusM ?? 120;
    this.maxCandidates = opts.maxCandidates ?? 5;
    this.maxWindow = opts.maxWindow ?? 3;
    this.nameConfidentAt = opts.nameConfidentAt ?? 0.85;
    this.nameFloor = opts.nameFloor ?? 0.45;
    this.maxNameWeight = opts.maxNameWeight ?? 0.65;
  }

  async run(input: OutletStageInput): Promise<OutletStageOutput> {
    // A rep who tapped the outlet in the app has already answered this
    // question. Nothing inferred should be allowed to override them.
    if (input.declaredOutletId) {
      const declared = await this.outlets.findById(input.companyId, input.declaredOutletId);
      if (declared) {
        return {
          outlet: {
            span: null,
            raw: null,
            candidates: [
              {
                outletId: declared.outletId,
                name: declared.name,
                distanceM: input.geo ? round(haversineMeters(input.geo, declared.geo), 1) : 0,
                nameScore: 0,
                score: 1,
              },
            ],
            margin: 1,
            gpsCandidateCount: 1,
            declared: true,
          },
        };
      }
      // Fall through: a declared id that no longer exists is stale, not
      // authoritative. Better to infer than to assert something wrong.
    }

    if (!input.geo) return { outlet: empty() };

    const nearby = await this.outlets.findNear(input.companyId, input.geo, this.radiusM);
    if (nearby.length === 0) return { outlet: empty() };

    const spoken = this.findSpokenName(input.transcript.text, nearby);

    // How much the spoken name is allowed to influence ranking, scaled by how
    // well the best candidate actually matched.
    //
    // This is a RAMP rather than a gate, and the difference is not cosmetic.
    // Gating hard at `nameConfidentAt` meant a real name match scoring 0.72 —
    // which is what heavily corrupted ASR output looks like for a name it got
    // right — was discarded wholesale, ranking a nearer shop first while
    // holding good evidence it had chosen to ignore. Observations then get
    // attributed to the wrong outlet, which is worse than being unsure.
    const nameWeight = spoken
      ? clamp01(
          (spoken.best - this.nameFloor) / Math.max(1e-6, this.nameConfidentAt - this.nameFloor),
        ) * this.maxNameWeight
      : 0;

    const candidates: OutletCandidate[] = nearby.map((o) => {
      const distanceM = haversineMeters(input.geo!, o.geo);
      const prox = proximityScore(distanceM, this.radiusM);
      const nameScore = spoken ? bestNameScore(spoken.keys, o) : 0;
      const score = prox * (1 - nameWeight) + nameScore * nameWeight;

      return {
        outletId: o.outletId,
        name: o.name,
        distanceM: round(distanceM, 1),
        nameScore: round(nameScore),
        score: round(score),
      };
    });

    candidates.sort((a, b) => b.score - a.score);
    const kept = candidates.slice(0, this.maxCandidates);

    return {
      outlet: {
        span: spoken?.span ?? null,
        raw: spoken?.raw ?? null,
        candidates: kept,
        margin: round((kept[0]?.score ?? 0) - (kept[1]?.score ?? 0)),
        gpsCandidateCount: nearby.length,
        declared: false,
      },
    };
  }

  /**
   * Locate the token run in the transcript that best names one of the nearby
   * outlets.
   *
   * Searched against the candidate set rather than a general place-name
   * gazetteer: the question is only ever "did they say one of THESE shops",
   * which keeps the search tiny and false positives rare.
   */
  private findSpokenName(
    text: string,
    nearby: Outlet[],
  ): { span: [number, number]; raw: string; keys: string[]; best: number } | null {
    const tokens = tokenize(text);
    if (tokens.length === 0) return null;

    let found: { span: [number, number]; raw: string; keys: string[]; best: number } | null = null;

    for (let start = 0; start < tokens.length; start++) {
      for (let len = 1; len <= this.maxWindow && start + len <= tokens.length; len++) {
        const window = tokens.slice(start, start + len);
        const first = window[0];
        const last = window[window.length - 1];
        if (!first || !last) continue;

        const keys = window.map((t) => phoneticKey(t.text)).filter((k) => k.length > 0);
        if (keys.length === 0) continue;

        let best = 0;
        for (const o of nearby) best = Math.max(best, bestNameScore(keys, o));

        if (best > (found?.best ?? 0)) {
          const span: [number, number] = [first.span[0], last.span[1]];
          found = { span, raw: text.slice(span[0], span[1]), keys, best };
        }
      }
    }

    return found && found.best >= 0.6 ? found : null;
  }
}

/**
 * How well a window names one outlet.
 *
 * Outlet names carry generic tails — "Store", "Enterprise", "Traders",
 * "স্টোর" — that every shop on the street shares. Averaging over all of them
 * would let the shared word carry a match, so the DISTINCTIVE part of the
 * name is weighted more heavily than the generic one.
 */
const GENERIC_NAME_PARTS = new Set(
  ["store", "stor", "enterprise", "enterpris", "trader", "traders", "sop", "shop", "vandar", "bandar"].map(
    (s) => phoneticKey(s),
  ),
);

function bestNameScore(windowKeys: string[], outlet: Outlet): number {
  const parts = outlet.name.split(/\s+/).map(phoneticKey).filter((k) => k.length > 0);
  if (parts.length === 0) return 0;

  let weighted = 0;
  let totalWeight = 0;

  for (const part of parts) {
    const weight = GENERIC_NAME_PARTS.has(part) ? 0.3 : 1;
    let best = 0;
    for (const key of windowKeys) best = Math.max(best, phoneticSimilarity(part, key));
    weighted += best * weight;
    totalWeight += weight;
  }

  return totalWeight === 0 ? 0 : weighted / totalWeight;
}

function empty(): OutletResolution {
  return {
    span: null,
    raw: null,
    candidates: [],
    margin: 0,
    gpsCandidateCount: 0,
    declared: false,
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
