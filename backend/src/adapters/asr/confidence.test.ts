import { describe, it, expect } from "vitest";
import { segmentConfidence, OPAQUE_PROVIDER_CONFIDENCE } from "./confidence";
import { buildBiasPrompt } from "./groq.adapter";

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

describe("buildBiasPrompt", () => {
  it("is null when there is nothing to bias towards", () => {
    expect(buildBiasPrompt(undefined)).toBeNull();
    expect(buildBiasPrompt([])).toBeNull();
    expect(buildBiasPrompt(["  ", ""])).toBeNull();
  });

  it("joins terms as a bare list, not a sentence", () => {
    // A fluent sentence would bias the STYLE of the output as well as its
    // vocabulary, which is not what a vocabulary hint is for.
    expect(buildBiasPrompt(["Bijoy Store", "PRAN Mango Juice"]))
      .toBe("Bijoy Store, PRAN Mango Juice");
  });

  it("drops duplicates case-insensitively", () => {
    expect(buildBiasPrompt(["PRAN", "pran", "Lux"])).toBe("PRAN, Lux");
  });

  it("truncates from the END, keeping the terms offered first", () => {
    // The caller orders by value, so a budget overflow must drop the tail.
    const out = buildBiasPrompt(["AAAA", "BBBB", "CCCC"], 12)!;
    expect(out.startsWith("AAAA")).toBe(true);
    expect(out).not.toContain("CCCC");
  });

  it("budgets in UTF-8 bytes, not characters", () => {
    // Bengali is 3 bytes per character. Counting characters overshot the API's
    // byte limit by roughly 3x and every request came back 400 — invisible for
    // as long as the vocabulary stays Latin.
    const bn = "প্রাণ";
    const out = buildBiasPrompt([bn, bn + "x", bn + "y"], 40)!;
    expect(Buffer.byteLength(out, "utf8")).toBeLessThanOrEqual(40);
  });

  it("never exceeds Groq's limit on a realistic Bangla catalogue", () => {
    const terms = Array.from({ length: 200 }, (_, i) => `প্রাণ ম্যাঙ্গো জুস ${i}`);
    expect(Buffer.byteLength(buildBiasPrompt(terms)!, "utf8")).toBeLessThanOrEqual(896);
  });
});
