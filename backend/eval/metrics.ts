import type { ObservationCore } from "@shared/observation.schema";
import { tokenize } from "@/common/text";

/**
 * Metrics for the evaluation harness.
 *
 * Kept pure and separate from the runner so they can be unit-tested against
 * hand-worked examples. A metric that is itself wrong is worse than no metric:
 * it produces confident numbers nobody can check.
 */

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

/** Word error rate: (substitutions + insertions + deletions) / reference words. */
export function wer(reference: string, hypothesis: string): number {
  const ref = tokenize(reference).map((t) => t.text);
  const hyp = tokenize(hypothesis).map((t) => t.text);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return editDistance(ref, hyp) / ref.length;
}

/** Character error rate. More forgiving than WER for agglutinative spelling. */
export function cer(reference: string, hypothesis: string): number {
  const ref = [...reference.replace(/\s+/g, "")];
  const hyp = [...hypothesis.replace(/\s+/g, "")];
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return editDistance(ref, hyp) / ref.length;
}

function editDistance<T>(a: T[], b: T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

// ---------------------------------------------------------------------------
// Field-level accuracy — the metric that actually matters
// ---------------------------------------------------------------------------

export interface FieldTally {
  correct: number;
  wrong: number;
  missed: number;
  spurious: number;
}

export const SCORED_FIELDS = [
  "type",
  "outletId",
  "skuId",
  "competitorBrand",
  "quantity",
  "priceDelta",
] as const;

export type ScoredField = (typeof SCORED_FIELDS)[number];

/**
 * Compare predicted observations against the labelled truth for one clip.
 *
 * Observations are matched greedily by best field agreement rather than by
 * position, because a clip yields an unordered set and a model listing them
 * in a different order has not made a mistake.
 *
 * Four outcomes per field, and the distinction matters:
 *   correct   both present and equal
 *   wrong     both present and different   ← the expensive kind
 *   missed    truth had it, prediction did not
 *   spurious  prediction invented one      ← the other expensive kind
 */
/** One truth row and whichever prediction was matched to it, if any. */
export interface Pairing {
  truth: ObservationCore;
  predicted: ObservationCore | undefined;
}

/**
 * Match predictions to labelled truth for one clip.
 *
 * Greedy on best field agreement rather than on position, because a clip
 * yields an unordered set and a model listing them in a different order has
 * not made a mistake.
 *
 * Exported because more than one metric needs it. The confidence calibration
 * previously did its own pairing and compared every prediction against
 * `truth[0]`, so on any clip carrying more than one observation it scored
 * predictions against the wrong reference — and multi-observation clips are
 * exactly the ones the evaluation set over-samples, being the headline claim.
 * One matcher, used by both, is the only way those two can agree.
 */
export function pairObservations(
  predicted: ObservationCore[],
  truth: ObservationCore[],
): { pairs: Pairing[]; unmatched: ObservationCore[] } {
  const used = new Set<number>();
  const pairs: Pairing[] = [];

  for (const t of truth) {
    let bestIdx = -1;
    let bestAgreement = -1;
    predicted.forEach((p, i) => {
      if (used.has(i)) return;
      const a = agreement(p, t);
      if (a > bestAgreement) {
        bestAgreement = a;
        bestIdx = i;
      }
    });

    const p = bestIdx >= 0 ? predicted[bestIdx] : undefined;
    if (p) used.add(bestIdx);
    pairs.push({ truth: t, predicted: p });
  }

  return { pairs, unmatched: predicted.filter((_, i) => !used.has(i)) };
}

export function scoreClip(
  predicted: ObservationCore[],
  truth: ObservationCore[],
): Record<ScoredField, FieldTally> {
  const tally = emptyTally();
  const { pairs, unmatched } = pairObservations(predicted, truth);

  for (const { truth: t, predicted: p } of pairs) {
    for (const f of SCORED_FIELDS) {
      const tv = normalise((t as Record<string, unknown>)[f]);
      const pv = p ? normalise((p as Record<string, unknown>)[f]) : null;
      bump(tally[f], tv, pv);
    }
  }

  // Predictions that matched no truth row at all: every populated field on
  // them is spurious.
  for (const p of unmatched) {
    for (const f of SCORED_FIELDS) {
      const pv = normalise((p as Record<string, unknown>)[f]);
      if (pv !== null) tally[f].spurious++;
    }
  }

  return tally;
}

function bump(t: FieldTally, truth: unknown, pred: unknown): void {
  if (truth === null && pred === null) return;
  if (truth === null) t.spurious++;
  else if (pred === null) t.missed++;
  else if (truth === pred) t.correct++;
  else t.wrong++;
}

function agreement(a: ObservationCore, b: ObservationCore): number {
  let n = 0;
  for (const f of SCORED_FIELDS) {
    const av = normalise((a as Record<string, unknown>)[f]);
    const bv = normalise((b as Record<string, unknown>)[f]);
    if (av !== null && av === bv) n++;
  }
  return n;
}

function normalise(v: unknown): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "number" ? v : String(v);
}

function emptyTally(): Record<ScoredField, FieldTally> {
  return Object.fromEntries(
    SCORED_FIELDS.map((f) => [f, { correct: 0, wrong: 0, missed: 0, spurious: 0 }]),
  ) as Record<ScoredField, FieldTally>;
}

export function mergeTallies(
  a: Record<ScoredField, FieldTally>,
  b: Record<ScoredField, FieldTally>,
): Record<ScoredField, FieldTally> {
  const out = emptyTally();
  for (const f of SCORED_FIELDS) {
    out[f] = {
      correct: a[f].correct + b[f].correct,
      wrong: a[f].wrong + b[f].wrong,
      missed: a[f].missed + b[f].missed,
      spurious: a[f].spurious + b[f].spurious,
    };
  }
  return out;
}

export function precisionRecall(t: FieldTally): {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
} {
  const predicted = t.correct + t.wrong + t.spurious;
  const actual = t.correct + t.wrong + t.missed;
  const precision = predicted === 0 ? 1 : t.correct / predicted;
  const recall = actual === 0 ? 1 : t.correct / actual;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const total = predicted + t.missed;
  return {
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    accuracy: round(total === 0 ? 1 : t.correct / total),
  };
}

// ---------------------------------------------------------------------------
// Calibration — does the confidence mean anything?
// ---------------------------------------------------------------------------

export interface CalibrationBin {
  lower: number;
  upper: number;
  count: number;
  correct: number;
  meanConfidence: number;
  observedAccuracy: number;
}

/**
 * Reliability diagram plus expected calibration error.
 *
 * The question this answers is the one that decides whether the confidence
 * gate is worth anything: OF the fields the system passed at 0.9, how many
 * were actually right? A system whose 0.9 means 0.6 in practice is worse than
 * one with no confidence at all, because it suppresses the very prompts that
 * would have caught its errors.
 */
export function calibration(
  samples: Array<{ confidence: number; correct: boolean }>,
  bins = 10,
): { bins: CalibrationBin[]; ece: number; brier: number } {
  const out: CalibrationBin[] = [];
  let ece = 0;
  let brier = 0;

  for (const s of samples) brier += (s.confidence - (s.correct ? 1 : 0)) ** 2;

  for (let i = 0; i < bins; i++) {
    const lower = i / bins;
    const upper = (i + 1) / bins;
    const inBin = samples.filter(
      (s) => s.confidence >= lower && (i === bins - 1 ? s.confidence <= upper : s.confidence < upper),
    );
    if (inBin.length === 0) {
      out.push({ lower, upper, count: 0, correct: 0, meanConfidence: 0, observedAccuracy: 0 });
      continue;
    }
    const correct = inBin.filter((s) => s.correct).length;
    const meanConfidence = inBin.reduce((a, s) => a + s.confidence, 0) / inBin.length;
    const observedAccuracy = correct / inBin.length;
    ece += (inBin.length / samples.length) * Math.abs(meanConfidence - observedAccuracy);
    out.push({
      lower,
      upper,
      count: inBin.length,
      correct,
      meanConfidence: round(meanConfidence),
      observedAccuracy: round(observedAccuracy),
    });
  }

  return {
    bins: out,
    ece: round(ece),
    brier: round(samples.length === 0 ? 0 : brier / samples.length),
  };
}

/**
 * How much work the flagging actually does.
 *
 * The headline number for the poster: flag N% of fields and catch M% of all
 * errors. A gate that flags 15% and catches 80% of errors is doing real work;
 * one that flags 15% and catches 15% is choosing at random.
 */
export function gateEffectiveness(
  samples: Array<{ flagged: boolean; correct: boolean }>,
): { flaggedShare: number; errorsCaught: number; precisionOfFlag: number } {
  const total = samples.length;
  if (total === 0) return { flaggedShare: 0, errorsCaught: 0, precisionOfFlag: 0 };

  const flagged = samples.filter((s) => s.flagged);
  const errors = samples.filter((s) => !s.correct);
  const caught = flagged.filter((s) => !s.correct);

  return {
    flaggedShare: round(flagged.length / total),
    errorsCaught: round(errors.length === 0 ? 1 : caught.length / errors.length),
    precisionOfFlag: round(flagged.length === 0 ? 0 : caught.length / flagged.length),
  };
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
