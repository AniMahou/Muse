import { describe, it, expect } from "vitest";
import { tokenize, spanOf, spansOverlap, levenshtein, similarity } from "./text";
import { transcriptFromText, attachSpans, confidenceOverSpan } from "./transcript";
import { haversineMeters, proximityScore } from "./geo";

describe("tokenize", () => {
  it("returns spans that index back into the source exactly", () => {
    const text = "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস";
    for (const t of tokenize(text)) {
      expect(text.slice(t.span[0], t.span[1])).toBe(t.text);
    }
  });

  it("strips edge punctuation without corrupting spans", () => {
    const text = "লাগবে, আর হুইল।";
    const tokens = tokenize(text);
    expect(tokens.map((t) => t.text)).toEqual(["লাগবে", "আর", "হুইল"]);
    for (const t of tokens) {
      expect(text.slice(t.span[0], t.span[1])).toBe(t.text);
    }
  });

  it("handles the Bangla full stop (দাঁড়ি) as punctuation", () => {
    expect(tokenize("শেষ।").map((t) => t.text)).toEqual(["শেষ"]);
  });

  it("handles mixed Bangla and Latin", () => {
    expect(tokenize("PRAN ম্যাঙ্গো 250ml").map((t) => t.text)).toEqual([
      "PRAN",
      "ম্যাঙ্গো",
      "250ml",
    ]);
  });

  it("returns an empty list for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
    expect(tokenize("")).toEqual([]);
  });

  it("drops tokens that are punctuation only", () => {
    expect(tokenize("ক — খ").map((t) => t.text)).toEqual(["ক", "খ"]);
  });
});

describe("spanOf / spansOverlap", () => {
  it("merges a token run into one span", () => {
    const text = "দেড় ডজন প্রাণ";
    const tokens = tokenize(text);
    expect(text.slice(...spanOf(tokens, 0, 1))).toBe("দেড় ডজন");
  });

  it("throws when the range is out of bounds", () => {
    expect(() => spanOf(tokenize("ক"), 0, 5)).toThrow();
  });

  it("detects overlap correctly at the boundaries", () => {
    expect(spansOverlap([0, 5], [4, 9])).toBe(true);
    expect(spansOverlap([0, 5], [5, 9])).toBe(false); // half-open: touching is not overlapping
    expect(spansOverlap([0, 10], [3, 4])).toBe(true);
  });
});

describe("levenshtein / similarity", () => {
  it("is zero distance for identical strings", () => {
    expect(levenshtein("হুইল", "হুইল")).toBe(0);
    expect(similarity("হুইল", "হুইল")).toBe(1);
  });

  it("counts a single substitution as distance one", () => {
    expect(levenshtein("হুইল", "হইল")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(similarity("", "")).toBe(1);
  });

  it("is symmetric", () => {
    expect(levenshtein("প্রাণ", "প্রান")).toBe(levenshtein("প্রান", "প্রাণ"));
  });

  it("never returns a negative similarity", () => {
    expect(similarity("abcdefgh", "z")).toBeGreaterThanOrEqual(0);
  });
});

describe("transcriptFromText", () => {
  it("produces words whose spans slice back to the word", () => {
    const t = transcriptFromText("দেড় ডজন প্রাণ ম্যাঙ্গো");
    for (const w of t.words) {
      expect(t.text.slice(w.span[0], w.span[1])).toBe(w.w);
    }
  });

  it("applies the requested uniform confidence", () => {
    const t = transcriptFromText("ক খ গ", { conf: 0.42 });
    expect(t.words.every((w) => w.conf === 0.42)).toBe(true);
  });
});

describe("attachSpans", () => {
  it("aligns provider words to character offsets", () => {
    const text = "বিজয় স্টোরে হুইল";
    const words = attachSpans(text, [
      { w: "বিজয়", start: 0, end: 0.4, conf: 0.9 },
      { w: "স্টোরে", start: 0.4, end: 0.8, conf: 0.6 },
      { w: "হুইল", start: 0.8, end: 1.2, conf: 0.8 },
    ]);
    for (const w of words) expect(text.slice(w.span[0], w.span[1])).toBe(w.w);
  });

  it("keeps array length stable when a word is not literally present", () => {
    const words = attachSpans("ক খ", [
      { w: "ক", start: 0, end: 1, conf: 0.9 },
      { w: "নাই", start: 1, end: 2, conf: 0.3 },
      { w: "খ", start: 2, end: 3, conf: 0.9 },
    ]);
    expect(words).toHaveLength(3);
  });

  it("disambiguates repeated words by advancing the cursor", () => {
    const text = "ক খ ক";
    const words = attachSpans(text, [
      { w: "ক", start: 0, end: 1, conf: 0.9 },
      { w: "খ", start: 1, end: 2, conf: 0.9 },
      { w: "ক", start: 2, end: 3, conf: 0.9 },
    ]);
    expect(words[0]!.span[0]).toBe(0);
    expect(words[2]!.span[0]).toBe(4);
  });
});

describe("confidenceOverSpan", () => {
  it("returns the confidence of the single overlapping word", () => {
    const t = transcriptFromText("বিজয় স্টোরে হুইল", { conf: 0.5 });
    t.words[1]!.conf = 0.2;
    const span = t.words[1]!.span;
    expect(confidenceOverSpan(t, span)).toBeCloseTo(0.2, 5);
  });

  it("weights by overlap across several words", () => {
    const text = "abcd efgh";
    const t = transcriptFromText(text, { conf: 1 });
    t.words[0]!.conf = 0.0;
    t.words[1]!.conf = 1.0;
    // Span covers all of both words: 4 chars at 0.0 and 4 chars at 1.0.
    expect(confidenceOverSpan(t, [0, 9])).toBeCloseTo(0.5, 5);
  });

  it("falls back to the transcript mean when nothing overlaps", () => {
    const t = transcriptFromText("ক খ", { conf: 0.7 });
    expect(confidenceOverSpan(t, [500, 510])).toBeCloseTo(0.7, 5);
  });

  it("returns zero for an empty span", () => {
    const t = transcriptFromText("ক খ", { conf: 0.7 });
    expect(confidenceOverSpan(t, [3, 3])).toBe(0);
  });
});

describe("geo", () => {
  it("computes a known short distance", () => {
    // ~111 m per 0.001 degree of latitude.
    const d = haversineMeters({ lat: 23.78, lng: 90.4 }, { lat: 23.781, lng: 90.4 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it("is zero for the same point", () => {
    expect(haversineMeters({ lat: 23.78, lng: 90.4 }, { lat: 23.78, lng: 90.4 })).toBeCloseTo(0, 6);
  });

  it("maps proximity to 0..1 within the radius", () => {
    expect(proximityScore(0, 100)).toBe(1);
    expect(proximityScore(50, 100)).toBeCloseTo(0.5, 5);
    expect(proximityScore(150, 100)).toBe(0);
  });
});
