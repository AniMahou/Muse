import { describe, it, expect } from "vitest";
import { NumeralStage } from "./index";
import { transcriptFromText } from "@/common/transcript";

const stage = new NumeralStage();

/** Parse a bare phrase and return its single quantity, or null. */
function one(text: string) {
  const { quantities } = stage.run(transcriptFromText(text));
  return quantities[0] ?? null;
}
function all(text: string) {
  return stage.run(transcriptFromText(text)).quantities;
}
/** Assert the numeric value of the first quantity found. */
function val(text: string): number | null {
  return one(text)?.value ?? null;
}

describe("cardinals", () => {
  const cases: Array<[string, number]> = [
    ["এক", 1],
    ["দুই", 2],
    ["তিন", 3],
    ["চার", 4],
    ["পাঁচ", 5],
    ["ছয়", 6],
    ["সাত", 7],
    ["আট", 8],
    ["নয়", 9],
    ["দশ", 10],
    ["এগারো", 11],
    ["বারো", 12],
    ["তেরো", 13],
    ["চৌদ্দ", 14],
    ["পনেরো", 15],
    ["ষোল", 16],
    ["সতেরো", 17],
    ["আঠারো", 18],
    ["উনিশ", 19],
    ["বিশ", 20],
    ["পঁচিশ", 25],
    ["ত্রিশ", 30],
    ["চল্লিশ", 40],
    ["পঞ্চাশ", 50],
    ["ষাট", 60],
    ["সত্তর", 70],
    ["আশি", 80],
    ["নব্বই", 90],
  ];
  for (const [text, expected] of cases) {
    it(`${text} = ${expected}`, () => expect(val(text)).toBe(expected));
  }
});

describe("digits", () => {
  it("parses Bengali digits", () => expect(val("১২")).toBe(12));
  it("parses ASCII digits", () => expect(val("12")).toBe(12));
  it("parses multi-digit Bengali", () => expect(val("২৫০")).toBe(250));
  it("parses decimals", () => expect(val("2.5")).toBe(2.5));
  it("treats Bengali and ASCII digits identically", () =>
    expect(val("১৮")).toBe(val("18")));
});

describe("standalone fractions", () => {
  it("দেড় = 1.5", () => expect(val("দেড়")).toBe(1.5));
  it("আড়াই = 2.5", () => expect(val("আড়াই")).toBe(2.5));
  it("আধা = 0.5", () => expect(val("আধা")).toBe(0.5));
});

describe("prefix fractions", () => {
  it("সাড়ে তিন = 3.5", () => expect(val("সাড়ে তিন")).toBe(3.5));
  it("সাড়ে চার = 4.5", () => expect(val("সাড়ে চার")).toBe(4.5));
  it("সোয়া তিন = 3.25", () => expect(val("সোয়া তিন")).toBe(3.25));
  it("সোয়া এক = 1.25", () => expect(val("সোয়া এক")).toBe(1.25));

  // পৌনে SUBTRACTS. This is the case naive keyword matching gets wrong.
  it("পৌনে চার = 3.75", () => expect(val("পৌনে চার")).toBe(3.75));
  it("পৌনে দুই = 1.75", () => expect(val("পৌনে দুই")).toBe(1.75));

  it("a dangling prefix with no cardinal yields nothing", () => {
    expect(all("সাড়ে")).toHaveLength(0);
    expect(all("পৌনে")).toHaveLength(0);
  });
});

describe("count multipliers", () => {
  it("দেড় ডজন = 18", () => expect(val("দেড় ডজন")).toBe(18));
  it("এক ডজন = 12", () => expect(val("এক ডজন")).toBe(12));
  it("দুই ডজন = 24", () => expect(val("দুই ডজন")).toBe(24));
  it("সাড়ে তিন ডজন = 42", () => expect(val("সাড়ে তিন ডজন")).toBe(42));
  it("আড়াই ডজন = 30", () => expect(val("আড়াই ডজন")).toBe(30));
  it("পৌনে দুই ডজন = 21", () => expect(val("পৌনে দুই ডজন")).toBe(21));
  it("তিন হালি = 12", () => expect(val("তিন হালি")).toBe(12));
  it("দুই গণ্ডা = 8", () => expect(val("দুই গণ্ডা")).toBe(8));
  it("দুই জোড়া = 4", () => expect(val("দুই জোড়া")).toBe(4));
  it("ডজন alone means one dozen", () => expect(val("ডজন")).toBe(null));
});

describe("scales", () => {
  it("পাঁচশ = 500", () => expect(val("পাঁচ শ")).toBe(500));
  it("তিন হাজার = 3000", () => expect(val("তিন হাজার")).toBe(3000));
  it("আড়াই লাখ = 250000", () => expect(val("আড়াই লাখ")).toBe(250_000));
  it("দুই কোটি = 20000000", () => expect(val("দুই কোটি")).toBe(20_000_000));
  it("composes across a thousand boundary: তিন হাজার পাঁচ শ = 3500", () =>
    expect(val("তিন হাজার পাঁচ শ")).toBe(3500));
  it("সাড়ে তিন হাজার = 3500", () => expect(val("সাড়ে তিন হাজার")).toBe(3500));
});

describe("compounds written as one word", () => {
  it("দেড়শ = 150", () => expect(val("দেড়শ")).toBe(150));
  it("আড়াইশ = 250", () => expect(val("আড়াইশ")).toBe(250));
  it("দেড় হাজার = 1500", () => expect(val("দেড় হাজার")).toBe(1500));
});

describe("units of measure", () => {
  it("attaches carton", () => expect(one("দুই কার্টন")?.unit).toBe("carton"));
  it("attaches BDT", () => {
    const q = one("পাঁচ টাকা");
    expect(q?.value).toBe(5);
    expect(q?.unit).toBe("BDT");
  });
  it("attaches kg", () => expect(one("তিন কেজি")?.unit).toBe("kg"));
  it("attaches litre", () => expect(one("দুই লিটার")?.unit).toBe("litre"));
  it("attaches piece", () => expect(one("দশ পিস")?.unit).toBe("piece"));
  it("attaches sack", () => expect(one("চার বস্তা")?.unit).toBe("sack"));

  it("defaults a count multiplier to pieces", () => {
    const q = one("দেড় ডজন");
    expect(q?.value).toBe(18);
    expect(q?.unit).toBe("piece");
  });

  it("an explicit unit overrides the piece default", () => {
    const q = one("দেড় ডজন কার্টন");
    expect(q?.value).toBe(18);
    expect(q?.unit).toBe("carton");
  });

  it("leaves the unit null when none is stated", () => {
    expect(one("বারো")?.unit).toBe(null);
  });
});

describe("ASR spelling variants", () => {
  // These are the forms that actually arrive from speech recognition.
  it("দের ডজন still resolves to 18", () => expect(val("দের ডজন")).toBe(18));
  it("সারে তিন = 3.5", () => expect(val("সারে তিন")).toBe(3.5));
  it("পোনে চার = 3.75", () => expect(val("পোনে চার")).toBe(3.75));
  it("আরাই = 2.5", () => expect(val("আরাই")).toBe(2.5));
  it("পাচ টাকা = 5 BDT", () => {
    const q = one("পাচ টাকা");
    expect(q?.value).toBe(5);
    expect(q?.unit).toBe("BDT");
  });
  it("ডজোন is read as a dozen", () => expect(val("দুই ডজোন")).toBe(24));

  it("a variant scores lower confidence than the canonical spelling", () => {
    const canonical = one("দেড় ডজন")!;
    const variant = one("দের ডজন")!;
    expect(variant.confidence).toBeLessThan(canonical.confidence);
    expect(canonical.confidence).toBe(1);
  });
});

describe("regional variants seen in real ASR output", () => {
  // দর্জন is the Hindi/Urdu-influenced form, genuinely used in Bangladesh and
  // produced by Whisper on real audio. At 0.75 phonetic similarity it sits
  // below the fuzzy floor, so it has to be listed explicitly.
  it("দের দর্জন = 18", () => expect(val("দের দর্জন")).toBe(18));
  it("দরজন is read as a dozen", () => expect(val("এক দরজন")).toBe(12));
});

describe("fuzzy fallback for unlisted misspellings", () => {
  it("recovers a one-character corruption", () => {
    // Not in the variant table; must come through fuzzy matching.
    expect(val("তীন")).toBe(3);
  });

  it("records reduced confidence for a fuzzy hit", () => {
    const q = one("তীন");
    expect(q).not.toBeNull();
    expect(q!.confidence).toBeLessThan(0.95);
  });

  it("does not match genuinely unrelated words", () => {
    expect(all("দোকানে")).toHaveLength(0);
    expect(all("ভালো")).toHaveLength(0);
    expect(all("কিন্তু")).toHaveLength(0);
  });

  it("ignores single characters", () => {
    expect(all("ক")).toHaveLength(0);
  });
});

describe("spans point back into the transcript", () => {
  it("raw text matches the span exactly", () => {
    const text = "বিজয় স্টোরে দেড় ডজন লাগবে";
    const q = stage.run(transcriptFromText(text)).quantities[0]!;
    expect(text.slice(q.span[0], q.span[1])).toBe(q.raw);
    expect(q.raw).toBe("দেড় ডজন");
  });

  it("never rewrites the transcript", () => {
    const text = "দের ডজন";
    const t = transcriptFromText(text);
    stage.run(t);
    expect(t.text).toBe("দের ডজন"); // the misspelling survives; only annotations are added
  });

  it("includes a trailing unit in the span", () => {
    const text = "পাঁচ টাকা কম";
    const q = stage.run(transcriptFromText(text)).quantities[0]!;
    expect(q.raw).toBe("পাঁচ টাকা");
  });
});

describe("full utterances", () => {
  it("extracts both quantities from the reference clip", () => {
    const text =
      "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে, আর হুইল এর নতুন অফার দিছে, পাঁচ টাকা কম";
    const qs = all(text);
    expect(qs).toHaveLength(2);
    expect(qs[0]!.value).toBe(18);
    expect(qs[0]!.unit).toBe("piece");
    expect(qs[1]!.value).toBe(5);
    expect(qs[1]!.unit).toBe("BDT");
  });

  it("extracts both from the ASR-mangled version of the same clip", () => {
    const text =
      "বিজয় স্টরে প্রান ম্যাঙ্গো জুস দের ডজন লাগবে আর হইল এর নতুন অফার দিছে পাচ টাকা কম";
    const qs = all(text);
    expect(qs).toHaveLength(2);
    expect(qs[0]!.value).toBe(18);
    expect(qs[1]!.value).toBe(5);
  });

  it("handles several quantities in one sentence", () => {
    const qs = all("তিন কার্টন আর দুই ডজন আর পাঁচ কেজি");
    expect(qs.map((q) => q.value)).toEqual([3, 24, 5]);
    expect(qs.map((q) => q.unit)).toEqual(["carton", "piece", "kg"]);
  });

  it("returns nothing for a sentence with no quantity", () => {
    expect(all("দোকান বন্ধ ছিল আজকে")).toHaveLength(0);
  });

  it("returns nothing for empty input", () => {
    expect(all("")).toHaveLength(0);
  });
});

describe("derivation is human readable", () => {
  it("explains দেড় ডজন", () => {
    const q = one("দেড় ডজন")!;
    expect(q.basis).toContain("1.5");
    expect(q.basis).toContain("12");
  });

  it("explains a prefix fraction", () => {
    expect(one("পৌনে চার")!.basis).toContain("পৌনে");
  });
});

describe("confidence", () => {
  it("is 1 for a fully canonical expression", () => {
    expect(one("দেড় ডজন")!.confidence).toBe(1);
  });

  it("takes the worst token in the expression", () => {
    // Canonical fraction, variant multiplier: the multiplier should dominate.
    const q = one("দেড় ডজোন")!;
    expect(q.value).toBe(18);
    expect(q.confidence).toBeLessThan(1);
  });

  it("stays within 0..1", () => {
    for (const text of ["দেড় ডজন", "তীন", "পাচ টাকা", "সারে তিন হাজার"]) {
      const q = one(text);
      if (!q) continue;
      expect(q.confidence).toBeGreaterThanOrEqual(0);
      expect(q.confidence).toBeLessThanOrEqual(1);
    }
  });
});
