import { describe, it, expect } from "vitest";
import { segmentConfidence, OPAQUE_PROVIDER_CONFIDENCE } from "./confidence";

describe("segmentConfidence", () => {
  it("maps avg_logprob through exp", () => {
    expect(segmentConfidence({ avgLogprob: -0.1 })).toBeCloseTo(0.9048, 3);
    expect(segmentConfidence({ avgLogprob: -0.5 })).toBeCloseTo(0.6065, 3);
    expect(segmentConfidence({ avgLogprob: -1.0 })).toBeCloseTo(0.3679, 3);
  });

  it("is monotonic in avg_logprob", () => {
    const a = segmentConfidence({ avgLogprob: -0.2 });
    const b = segmentConfidence({ avgLogprob: -0.8 });
    expect(a).toBeGreaterThan(b);
  });

  it("discounts segments the model thinks are silence", () => {
    const speech = segmentConfidence({ avgLogprob: -0.2, noSpeechProb: 0.01 });
    const silence = segmentConfidence({ avgLogprob: -0.2, noSpeechProb: 0.9 });
    expect(silence).toBeLessThan(speech * 0.2);
  });

  it("halves confidence on a runaway compression ratio", () => {
    const sane = segmentConfidence({ avgLogprob: -0.2, compressionRatio: 1.5 });
    const looped = segmentConfidence({ avgLogprob: -0.2, compressionRatio: 5 });
    expect(looped).toBeCloseTo(sane * 0.5, 3);
  });

  it("falls back to a mid value with no signal at all", () => {
    expect(segmentConfidence({})).toBe(0.75);
  });

  it("stays within 0..1", () => {
    for (const lp of [0, -0.001, -5, -50]) {
      const c = segmentConfidence({ avgLogprob: lp });
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("treats NaN as no confidence rather than propagating it", () => {
    expect(segmentConfidence({ avgLogprob: NaN })).toBe(0);
  });

  it("keeps the opaque-provider fallback mid-range", () => {
    // High would suppress the clarification prompts that make the system
    // safe; low would flag every field.
    expect(OPAQUE_PROVIDER_CONFIDENCE).toBeGreaterThan(0.5);
    expect(OPAQUE_PROVIDER_CONFIDENCE).toBeLessThan(0.85);
  });
});
