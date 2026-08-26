import { describe, it, expect } from "vitest";
import {
  wer, cer, scoreClip, pairObservations, precisionRecall, mergeTallies,
  calibration, gateEffectiveness, SCORED_FIELDS,
} from "./metrics";
import type { ObservationCore } from "@shared/observation.schema";

function obs(over: Partial<ObservationCore> = {}): ObservationCore {
  return {
    type: "demand_signal",
    outletId: "OUT-1", skuId: "SKU-1", competitorBrand: null,
    quantity: 18, unit: "piece", priceDelta: null,
    severity: "medium", verbatimBn: "x",
    ...over,
  };
}

describe("wer / cer", () => {
  it("is zero for identical text", () => {
    expect(wer("দেড় ডজন লাগবে", "দেড় ডজন লাগবে")).toBe(0);
    expect(cer("দেড় ডজন", "দেড় ডজন")).toBe(0);
  });

  it("counts one substitution in three words as one third", () => {
    expect(wer("দেড় ডজন লাগবে", "দের ডজন লাগবে")).toBeCloseTo(1 / 3, 5);
  });

  it("counts deletions and insertions", () => {
    expect(wer("a b c", "a b")).toBeCloseTo(1 / 3, 5);
    expect(wer("a b", "a b c")).toBeCloseTo(1 / 2, 5);
  });

  it("CER is more forgiving than WER on a one-character slip", () => {
    // The whole reason both are reported: a single wrong character destroys a
    // word for WER while barely moving CER.
    const ref = "প্রাণ ম্যাঙ্গো জুস";
    const hyp = "প্রান ম্যাঙ্গো জুস";
    expect(cer(ref, hyp)).toBeLessThan(wer(ref, hyp));
  });

  it("handles empty inputs", () => {
    expect(wer("", "")).toBe(0);
    expect(wer("", "a")).toBe(1);
    expect(wer("a", "")).toBe(1);
  });
});

describe("scoreClip", () => {
  it("counts a perfect match as all correct", () => {
    const t = scoreClip([obs()], [obs()]);
    expect(t.skuId).toEqual({ correct: 1, wrong: 0, missed: 0, spurious: 0 });
    expect(t.quantity.correct).toBe(1);
  });

  it("distinguishes wrong from missed", () => {
    const wrongSku = scoreClip([obs({ skuId: "SKU-2" })], [obs()]);
    expect(wrongSku.skuId.wrong).toBe(1);

    const noSku = scoreClip([obs({ skuId: null })], [obs()]);
    expect(noSku.skuId.missed).toBe(1);
  });

  it("counts an invented value as spurious", () => {
    const t = scoreClip([obs({ competitorBrand: "COMP-X" })], [obs()]);
    expect(t.competitorBrand.spurious).toBe(1);
  });

  it("matches observations by content, not by order", () => {
    // A clip yields an unordered set; listing them differently is not an error.
    const a = obs({ skuId: "SKU-1", quantity: 18 });
    const b = obs({ skuId: "SKU-2", quantity: 5, type: "stock_out" });
    const t = scoreClip([b, a], [a, b]);
    expect(t.skuId.correct).toBe(2);
    expect(t.skuId.wrong).toBe(0);
  });

  it("marks every field of an unmatched prediction spurious", () => {
    const t = scoreClip([obs(), obs({ skuId: "SKU-9", type: "posm_issue" })], [obs()]);
    expect(t.skuId.spurious).toBe(1);
  });

  it("counts a missing prediction as missed across fields", () => {
    const t = scoreClip([], [obs()]);
    expect(t.skuId.missed).toBe(1);
    expect(t.outletId.missed).toBe(1);
  });

  it("ignores fields null on both sides", () => {
    const t = scoreClip([obs()], [obs()]);
    expect(t.priceDelta).toEqual({ correct: 0, wrong: 0, missed: 0, spurious: 0 });
  });

  it("covers every scored field", () => {
    const t = scoreClip([obs()], [obs()]);
    expect(Object.keys(t).sort()).toEqual([...SCORED_FIELDS].sort());
  });
});

describe("precisionRecall", () => {
  it("computes a worked example", () => {
    const r = precisionRecall({ correct: 8, wrong: 1, missed: 1, spurious: 1 });
    expect(r.precision).toBeCloseTo(8 / 10, 4);
    expect(r.recall).toBeCloseTo(8 / 10, 4);
    expect(r.f1).toBeCloseTo(0.8, 4);
  });

  it("is 1 for an empty tally — nothing to get wrong", () => {
    const r = precisionRecall({ correct: 0, wrong: 0, missed: 0, spurious: 0 });
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
  });

  it("penalises spurious values in precision but not recall", () => {
    const r = precisionRecall({ correct: 5, wrong: 0, missed: 0, spurious: 5 });
    expect(r.precision).toBeCloseTo(0.5, 4);
    expect(r.recall).toBe(1);
  });
});

describe("mergeTallies", () => {
  it("sums across clips", () => {
    const a = scoreClip([obs()], [obs()]);
    const b = scoreClip([obs()], [obs()]);
    expect(mergeTallies(a, b).skuId.correct).toBe(2);
  });
});

describe("calibration", () => {
  it("reports near-zero ECE for a well-calibrated system", () => {
    const samples = [
      ...Array.from({ length: 90 }, () => ({ confidence: 0.9, correct: true })),
      ...Array.from({ length: 10 }, () => ({ confidence: 0.9, correct: false })),
    ];
    expect(calibration(samples).ece).toBeLessThan(0.02);
  });

  it("reports large ECE for an overconfident system", () => {
    // Claims 0.95, right half the time. This is the failure mode that makes a
    // confidence gate worse than none: it suppresses the prompts that would
    // have caught the errors.
    const samples = [
      ...Array.from({ length: 50 }, () => ({ confidence: 0.95, correct: true })),
      ...Array.from({ length: 50 }, () => ({ confidence: 0.95, correct: false })),
    ];
    expect(calibration(samples).ece).toBeGreaterThan(0.4);
  });

  it("returns the requested number of bins", () => {
    expect(calibration([{ confidence: 0.5, correct: true }], 5).bins).toHaveLength(5);
  });

  it("computes Brier score", () => {
    expect(calibration([{ confidence: 1, correct: true }]).brier).toBe(0);
    expect(calibration([{ confidence: 0, correct: true }]).brier).toBe(1);
  });

  it("handles no samples", () => {
    const r = calibration([]);
    expect(r.ece).toBe(0);
    expect(r.brier).toBe(0);
  });
});

describe("gateEffectiveness", () => {
  it("reports a gate that is doing real work", () => {
    // Flag 15%, catch 80% of errors — the headline number for the poster.
    const samples = [
      ...Array.from({ length: 8 }, () => ({ flagged: true, correct: false })),
      ...Array.from({ length: 7 }, () => ({ flagged: true, correct: true })),
      ...Array.from({ length: 2 }, () => ({ flagged: false, correct: false })),
      ...Array.from({ length: 83 }, () => ({ flagged: false, correct: true })),
    ];
    const r = gateEffectiveness(samples);
    expect(r.flaggedShare).toBeCloseTo(0.15, 2);
    expect(r.errorsCaught).toBeCloseTo(0.8, 2);
  });

  it("reports a gate choosing at random", () => {
    const samples = [
      ...Array.from({ length: 15 }, (_, i) => ({ flagged: true, correct: i > 1 })),
      ...Array.from({ length: 85 }, (_, i) => ({ flagged: false, correct: i > 7 })),
    ];
    expect(gateEffectiveness(samples).errorsCaught).toBeLessThan(0.3);
  });

  it("handles no samples", () => {
    expect(gateEffectiveness([])).toEqual({ flaggedShare: 0, errorsCaught: 0, precisionOfFlag: 0 });
  });
});

describe("pairObservations", () => {
  const o = (over: Partial<ObservationCore>): ObservationCore => ({
    type: "demand_signal", outletId: "OUT-1182", skuId: null, competitorBrand: null,
    quantity: null, unit: null, priceDelta: null, severity: "medium", verbatimBn: "",
    ...over,
  });

  it("matches on agreement, not on position", () => {
    // The model listing observations in a different order has not erred.
    const truth = [
      o({ type: "demand_signal", skuId: "SKU-404", quantity: 18 }),
      o({ type: "competitor_promo", competitorBrand: "COMP-WHEEL", priceDelta: -5 }),
    ];
    const predicted = [truth[1]!, truth[0]!];
    const { pairs, unmatched } = pairObservations(predicted, truth);
    expect(pairs[0]!.predicted).toBe(truth[0]);
    expect(pairs[1]!.predicted).toBe(truth[1]);
    expect(unmatched).toHaveLength(0);
  });

  it("reports a truth row nothing was matched to", () => {
    const truth = [o({ skuId: "SKU-404" }), o({ skuId: "SKU-501" })];
    const { pairs } = pairObservations([truth[0]!], truth);
    expect(pairs[1]!.predicted).toBeUndefined();
  });

  it("reports predictions matching no truth row", () => {
    const truth = [o({ skuId: "SKU-404" })];
    const extra = o({ type: "stock_out", skuId: "SKU-999" });
    const { unmatched } = pairObservations([truth[0]!, extra], truth);
    expect(unmatched).toEqual([extra]);
  });

  it("never matches one prediction to two truth rows", () => {
    const truth = [o({ skuId: "SKU-404" }), o({ skuId: "SKU-404" })];
    const { pairs } = pairObservations([o({ skuId: "SKU-404" })], truth);
    const matched = pairs.filter((p) => p.predicted !== undefined);
    expect(matched).toHaveLength(1);
  });
});
