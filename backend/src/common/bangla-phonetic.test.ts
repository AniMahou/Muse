import { describe, it, expect } from "vitest";
import {
  phoneticKey,
  phoneticKeys,
  consonantSkeleton,
  phoneticSimilarity,
  phoneticKeySimilarity,
} from "./bangla-phonetic";

describe("orthographic collapse", () => {
  it("collapses the three sibilants শ ষ স onto /s/", () => {
    expect(phoneticKey("শ")).toBe(phoneticKey("ষ"));
    expect(phoneticKey("ষ")).toBe(phoneticKey("স"));
  });

  it("collapses ণ and ন onto /n/", () => {
    expect(phoneticKey("প্রাণ")).toBe(phoneticKey("প্রান"));
  });

  it("collapses র, ড় and ঢ় onto /r/", () => {
    expect(phoneticKey("র")).toBe("r");
    expect(phoneticKey("ড়")).toBe("r");
    expect(phoneticKey("ঢ়")).toBe("r");
  });

  it("collapses vowel length, which is orthographic not phonemic", () => {
    expect(phoneticKey("তীন")).toBe(phoneticKey("তিন"));
    expect(phoneticKey("ই")).toBe(phoneticKey("ঈ"));
    expect(phoneticKey("উ")).toBe(phoneticKey("ঊ"));
  });

  it("collapses aspiration, which ASR loses first", () => {
    expect(phoneticKey("ক")).toBe(phoneticKey("খ"));
    expect(phoneticKey("ত")).toBe(phoneticKey("থ"));
    expect(phoneticKey("প")).toBe(phoneticKey("ফ"));
  });

  it("collapses the retroflex and dental series", () => {
    expect(phoneticKey("ট")).toBe(phoneticKey("ত"));
    expect(phoneticKey("ড")).toBe(phoneticKey("দ"));
  });

  it("drops the ya-phala, which only colours the vowel", () => {
    expect(phoneticKey("ম্যাঙ্গো")).toBe("mango");
  });

  it("normalises composed and decomposed nukta forms identically", () => {
    // য় as U+09DF versus য + U+09BC. Both must reach the same key, or a
    // consonant silently disappears depending on how the text was encoded.
    const precomposed = "য়";
    const decomposed = "য়";
    expect(phoneticKey(precomposed)).toBe(phoneticKey(decomposed));
  });

  it("squeezes repeated runs", () => {
    expect(phoneticKey("ম্যাঙ্গো")).not.toContain("gg");
  });

  it("returns empty string for input with no phonetic content", () => {
    expect(phoneticKey("")).toBe("");
    expect(phoneticKey("।")).toBe("");
    expect(phoneticKey("   ")).toBe("");
  });
});

describe("Latin folds into the same key space", () => {
  it("maps initial wh to hu, as Bengali speakers render it", () => {
    // Without this, the brand never matches its own catalogue entry.
    expect(phoneticKey("Wheel")).toBe(phoneticKey("হুইল"));
  });

  it("matches PRAN to প্রাণ and to the ASR variant প্রান", () => {
    expect(phoneticKey("PRAN")).toBe(phoneticKey("প্রাণ"));
    expect(phoneticKey("PRAN")).toBe(phoneticKey("প্রান"));
  });

  it("handles soft c before a front vowel", () => {
    expect(phoneticKey("Excel")).toBe(phoneticKey("এক্সেল"));
  });

  it("handles hard c elsewhere", () => {
    expect(phoneticKey("Colgate").startsWith("k")).toBe(true);
  });

  it("matches Harpic to হারপিক", () => {
    expect(phoneticKey("Harpic")).toBe(phoneticKey("হারপিক"));
  });

  it("is case insensitive", () => {
    expect(phoneticKey("WHEEL")).toBe(phoneticKey("wheel"));
  });

  it("keeps digits so pack sizes survive", () => {
    expect(phoneticKey("250ml")).toContain("250");
  });
});

describe("consonantSkeleton", () => {
  it("removes vowels", () => {
    expect(consonantSkeleton("mango")).toBe("mng");
    expect(consonantSkeleton("store")).toBe("str");
  });
});

describe("phoneticSimilarity — lenient, for product and outlet names", () => {
  const positives: Array<[string, string]> = [
    ["হুইল", "Wheel"],
    ["হইল", "Wheel"],
    ["প্রাণ", "PRAN"],
    ["ম্যাঙ্গো", "Mango"],
    ["জুস", "Juice"],
    ["স্টোরে", "স্টোর"],
    ["স্টরে", "স্টোর"],
    ["সার্ফ", "Surf"],
    ["লাক্স", "Lux"],
    ["কোলগেট", "Colgate"],
    ["ডেটল", "Dettol"],
    ["বিজয়", "Bijoy"],
  ];
  for (const [a, b] of positives) {
    it(`${a} ~ ${b} scores at least 0.9`, () => {
      expect(phoneticSimilarity(a, b)).toBeGreaterThanOrEqual(0.9);
    });
  }

  const negatives: Array<[string, string]> = [
    ["হুইল", "PRAN"],
    ["জুস", "Colgate"],
    ["দোকান", "Wheel"],
    ["ভালো", "Lux"],
    ["ম্যাঙ্গো", "Dettol"],
  ];
  for (const [a, b] of negatives) {
    it(`${a} vs ${b} stays below 0.5`, () => {
      expect(phoneticSimilarity(a, b)).toBeLessThan(0.5);
    });
  }

  it("scores an exact key match as 1", () => {
    expect(phoneticSimilarity("হুইল", "Wheel")).toBe(1);
  });

  it("returns 0 when either side has no phonetic content", () => {
    expect(phoneticSimilarity("", "Wheel")).toBe(0);
    expect(phoneticSimilarity("।", "Wheel")).toBe(0);
  });
});

describe("phoneticKeySimilarity — strict, for the numeral lexicon", () => {
  it("still folds vowel-length corruptions", () => {
    expect(phoneticKeySimilarity("তীন", "তিন")).toBe(1);
  });

  it("keeps সতেরো (17) distinct from স্টোরে (at the store)", () => {
    // These share the consonant skeleton s-t-r exactly. The lenient
    // comparison reads a shop as a number; the strict one does not.
    expect(phoneticSimilarity("স্টোরে", "সতেরো")).toBeGreaterThan(0.9);
    expect(phoneticKeySimilarity("স্টোরে", "সতেরো")).toBeLessThan(0.85);
  });

  it("keeps আর (and) away from চার (four)", () => {
    expect(phoneticKeySimilarity("আর", "চার")).toBeLessThan(0.85);
  });

  it("keeps দিন (day) away from তিন (three)", () => {
    expect(phoneticKeySimilarity("দিন", "তিন")).toBeLessThan(0.85);
  });
});

describe("phoneticKeys", () => {
  it("splits a phrase and drops empty tokens", () => {
    expect(phoneticKeys("প্রাণ ম্যাঙ্গো জুস")).toEqual(["pran", "mango", "jus"]);
  });

  it("returns an empty array for blank input", () => {
    expect(phoneticKeys("   ")).toEqual([]);
  });
});
