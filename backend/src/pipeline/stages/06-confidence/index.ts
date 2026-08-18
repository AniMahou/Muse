import type { ObservationCore } from "@shared/observation.schema";
import type { Annotations, ScoredObservation, Transcript } from "@shared/stage-io";
import { confidenceOverSpan } from "@/common/transcript";
import type { ConfidenceStageInput, ConfidenceStageOptions, ConfidenceStageOutput } from "./types";

/** Fields the model authors outright, with no upstream annotation behind them. */
const MODEL_ONLY_FIELDS = new Set(["type", "severity", "verbatimBn"]);

/**
 * Stage 6 — decide, per field, how much to trust what stage 5 produced.
 *
 * Confidence is DERIVED from upstream evidence and never self-reported.
 * Language models are badly calibrated and will cheerfully attach 0.95 to a
 * value they invented, so asking one how sure it is measures fluency rather
 * than correctness. Instead every field is traced back to the annotation that
 * produced it and scored on:
 *
 *   ASR confidence over the exact characters involved  — how clearly was it heard
 *   resolver margin (top-1 minus top-2)                — was the choice actually decisive
 *   grammar confidence                                 — canonical spelling, variant, or fuzz
 *
 * The margin term is the one that earns its place. A resolver can return a
 * high top score while a rival sits one point behind it; the score alone says
 * "confident" and the margin says "two products sound identical and I guessed".
 * Flagging on score alone would confirm exactly the cases most likely wrong.
 *
 * Low confidence NEVER discards data. It sets a status. A dropped observation
 * is unsellable into an enterprise; a flagged one is merely honest.
 */
export class ConfidenceStage {
  readonly name = "06-confidence";

  private readonly threshold: number;
  private readonly criticalFields: Set<string>;
  private readonly marginSaturatesAt: number;
  private readonly marginFloor: number;
  private readonly modelOnlyPenalty: number;

  constructor(opts: ConfidenceStageOptions = {}) {
    this.threshold = opts.threshold ?? 0.8;
    this.criticalFields = new Set(
      (opts.criticalFields ?? ["outlet_id", "sku", "quantity", "competitor_brand"]).map(
        normaliseFieldName,
      ),
    );
    this.marginSaturatesAt = opts.marginSaturatesAt ?? 0.3;
    this.marginFloor = opts.marginFloor ?? 0.55;
    this.modelOnlyPenalty = opts.modelOnlyPenalty ?? 0.9;
  }

  run(input: ConfidenceStageInput): ConfidenceStageOutput {
    const observations = input.observations.map((obs) =>
      this.score(obs, input.transcript, input.annotations),
    );
    return { observations };
  }

  private score(
    obs: ObservationCore,
    transcript: Transcript,
    annotations: Annotations,
  ): ScoredObservation {
    const fieldConfidence: Record<string, number> = {};
    const flaggedFields: string[] = [];

    for (const [field, value] of Object.entries(obs)) {
      // A field nobody filled has nothing to be uncertain about. Scoring null
      // would flag every observation for everything it did not mention.
      if (value === null || value === undefined) continue;

      const conf = this.confidenceFor(field, value, obs, transcript, annotations);
      fieldConfidence[field] = round(conf);

      if (this.criticalFields.has(normaliseFieldName(field)) && conf < this.threshold) {
        flaggedFields.push(field);
      }
    }

    return {
      ...obs,
      fieldConfidence,
      flaggedFields,
      status: flaggedFields.length > 0 ? "needs_clarification" : "confirmed",
    };
  }

  private confidenceFor(
    field: string,
    value: unknown,
    obs: ObservationCore,
    transcript: Transcript,
    annotations: Annotations,
  ): number {
    if (MODEL_ONLY_FIELDS.has(field)) return this.modelOnlyPenalty;

    if (field === "outletId") return this.outletConfidence(transcript, annotations);

    if (field === "skuId" || field === "competitorBrand") {
      return this.skuConfidence(String(value), transcript, annotations);
    }

    if (field === "quantity" || field === "priceDelta") {
      return this.quantityConfidence(Number(value), transcript, annotations);
    }

    if (field === "unit") {
      // The unit rides along with whichever quantity annotation supplied it.
      return obs.quantity === null
        ? this.modelOnlyPenalty
        : this.quantityConfidence(obs.quantity, transcript, annotations);
    }

    return this.modelOnlyPenalty;
  }

  private outletConfidence(transcript: Transcript, annotations: Annotations): number {
    const outlet = annotations.outlet;

    // The rep tapped the shop in the app. There is nothing to be unsure about.
    if (outlet.declared) return 1;
    if (outlet.candidates.length === 0) return 0;

    const margin = this.marginFactor(outlet.margin);

    // With no spoken name, GPS is the only evidence and the top candidate's
    // own score carries it.
    if (!outlet.span) {
      return clamp01((outlet.candidates[0]?.score ?? 0) * margin);
    }

    return clamp01(confidenceOverSpan(transcript, outlet.span) * margin);
  }

  private skuConfidence(
    skuId: string,
    transcript: Transcript,
    annotations: Annotations,
  ): number {
    const ann = annotations.skus.find((a) => a.candidates.some((c) => c.skuId === skuId));
    if (!ann) return 0; // stage 5 named something no annotation supports

    const chosen = ann.candidates.find((c) => c.skuId === skuId);
    const asr = confidenceOverSpan(transcript, ann.span);

    // An approved alias is a human decision that this surface form means this
    // product, so the ambiguity the margin measures does not apply.
    if (chosen?.viaAlias) return clamp01(asr * 0.95 + 0.05);

    // Choosing a candidate other than the top one is weaker evidence: the
    // model overrode the resolver's ranking, which may be right but is not
    // something the resolver's own margin vouches for.
    const rankPenalty = ann.candidates[0]?.skuId === skuId ? 1 : 0.85;

    return clamp01(asr * this.marginFactor(ann.margin) * (chosen?.score ?? 0.5) * rankPenalty + 0);
  }

  private quantityConfidence(
    value: number,
    transcript: Transcript,
    annotations: Annotations,
  ): number {
    const target = Math.abs(value);
    const ann = annotations.quantities.find((q) => Math.abs(q.value - target) < 1e-6);
    // Stage 5 already drops numbers the grammar did not produce, so a miss
    // here means the pipeline is inconsistent rather than the speech unclear.
    if (!ann) return 0;

    return clamp01(confidenceOverSpan(transcript, ann.span) * ann.confidence);
  }

  /**
   * Map a resolver margin onto a multiplier.
   *
   * Zero margin means two candidates are indistinguishable, which should pull
   * a field below the threshold on its own even when the audio was crisp.
   */
  private marginFactor(margin: number): number {
    const t = Math.min(Math.max(margin, 0) / this.marginSaturatesAt, 1);
    return this.marginFloor + (1 - this.marginFloor) * t;
  }
}

/** `outlet_id`, `outletId` and `sku`/`skuId` all name the same thing. */
function normaliseFieldName(field: string): string {
  const camel = field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  if (camel === "sku") return "skuId";
  if (camel === "outlet") return "outletId";
  if (camel === "competitorBrand") return "competitorBrand";
  return camel;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
