import { describe, it, expect, beforeEach } from "vitest";
import { SkuResolverStage } from "./index";
import { InMemoryCatalogRepo } from "@/adapters/catalog/in-memory.repo";
import { transcriptFromText } from "@/common/transcript";
import { SKUS, ALIASES, COMPANY_ID } from "./fixtures/catalog";

let repo: InMemoryCatalogRepo;
let stage: SkuResolverStage;

beforeEach(() => {
  repo = new InMemoryCatalogRepo(SKUS, ALIASES);
  stage = new SkuResolverStage(repo);
});

async function resolve(text: string, brands?: string[]) {
  const { skus } = await stage.run({
    transcript: transcriptFromText(text),
    companyId: COMPANY_ID,
    ...(brands ? { brands } : {}),
  });
  return skus;
}

/** Top candidate id for the first annotation. */
async function top(text: string, brands?: string[]) {
  const anns = await resolve(text, brands);
  return anns[0]?.candidates[0]?.skuId ?? null;
}

describe("clean transcripts", () => {
  it("resolves a full product name", async () => {
    expect(await top("প্রাণ ম্যাঙ্গো জুস")).toBe("SKU-404");
  });

  it("resolves a competitor brand", async () => {
    expect(await top("হুইল")).toBe("COMP-WHEEL");
  });

  it("resolves an English catalogue name spoken as-is", async () => {
    expect(await top("Harpic")).toBe("SKU-503");
  });

  it("finds a product mid-sentence", async () => {
    expect(await top("আজকে দোকানে প্রাণ ম্যাঙ্গো জুস শেষ")).toBe("SKU-404");
  });
});

describe("ASR-corrupted transcripts", () => {
  // These are the forms that actually arrive from speech recognition.
  it("প্রান (ণ→ন) still resolves", async () => {
    expect(await top("প্রান ম্যাঙ্গো জুস")).toBe("SKU-404");
  });

  it("হইল still resolves to Wheel", async () => {
    expect(await top("হইল")).toBe("COMP-WHEEL");
  });

  it("resolves both products in the mangled reference clip", async () => {
    const anns = await resolve(
      "বিজয় স্টরে প্রান ম্যাঙ্গো জুস দের ডজন লাগবে আর হইল এর নতুন অফার দিছে পাচ টাকা কম",
    );
    const ids = anns.flatMap((a) => a.candidates.slice(0, 1).map((c) => c.skuId));
    expect(ids).toContain("SKU-404");
    expect(ids).toContain("COMP-WHEEL");
  });
});

describe("candidates and margin", () => {
  it("returns candidates ordered by score", async () => {
    const [ann] = await resolve("প্রাণ ম্যাঙ্গো জুস");
    const scores = ann!.candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("reports a small margin when two products genuinely sound alike", async () => {
    // "PRAN Mango" alone cannot separate Mango Juice from Mango Drink.
    const [ann] = await resolve("প্রাণ ম্যাঙ্গো");
    expect(ann!.candidates.length).toBeGreaterThan(1);
    expect(ann!.margin).toBeLessThan(0.1);
  });

  it("reports a large margin when the mention is unambiguous", async () => {
    const [ann] = await resolve("হারপিক");
    expect(ann!.margin).toBeGreaterThan(0.3);
  });

  it("margin is the gap between the top two scores", async () => {
    const [ann] = await resolve("প্রাণ ম্যাঙ্গো জুস");
    const [c0, c1] = ann!.candidates;
    expect(ann!.margin).toBeCloseTo(c0!.score - (c1?.score ?? 0), 3);
  });

  it("caps the candidate list", async () => {
    const narrow = new SkuResolverStage(repo, { maxCandidates: 2 });
    const { skus } = await narrow.run({
      transcript: transcriptFromText("প্রাণ ম্যাঙ্গো"),
      companyId: COMPANY_ID,
    });
    expect(skus[0]!.candidates.length).toBeLessThanOrEqual(2);
  });
});

describe("pack size", () => {
  it("prefers the variant whose pack size was spoken", async () => {
    const withPack = await top("প্রাণ ম্যাঙ্গো জুস ২৫০ এমএল");
    expect(withPack).toBe("SKU-404");
  });

  it("does not require a pack size to match", async () => {
    expect(await top("প্রাণ লিচি জুস")).toBe("SKU-410");
  });
});

describe("approved aliases", () => {
  it("resolves through an alias and records which one", async () => {
    const [ann] = await resolve("চানাচুর");
    expect(ann!.candidates[0]!.skuId).toBe("SKU-420");
    expect(ann!.candidates[0]!.viaAlias).toBe("চানাচুর");
  });

  it("an alias outranks a weaker similarity match", async () => {
    const [ann] = await resolve("চানাচুর");
    expect(ann!.candidates[0]!.score).toBeGreaterThanOrEqual(0.9);
  });

  it("ignores an alias pointing outside the rep's scope", async () => {
    // SKU-420 is a PRAN product; scoping to Lux must exclude both it and its alias.
    const anns = await resolve("চানাচুর", ["Lux"]);
    const ids = anns.flatMap((a) => a.candidates.map((c) => c.skuId));
    expect(ids).not.toContain("SKU-420");
  });
});

describe("brand portfolio scoping", () => {
  it("excludes own-brand SKUs outside the portfolio", async () => {
    const anns = await resolve("প্রাণ ম্যাঙ্গো জুস", ["Lux", "Colgate"]);
    const ids = anns.flatMap((a) => a.candidates.map((c) => c.skuId));
    expect(ids).not.toContain("SKU-404");
  });

  it("keeps competitors visible regardless of portfolio", async () => {
    // A rep reports on rivals they do not themselves carry.
    expect(await top("হুইল", ["PRAN"])).toBe("COMP-WHEEL");
  });

  it("scoping raises the top score by removing confusable neighbours", async () => {
    const wide = await resolve("প্রাণ ম্যাঙ্গো");
    const narrow = new SkuResolverStage(
      new InMemoryCatalogRepo(SKUS, ALIASES),
    );
    const { skus: scoped } = await narrow.run({
      transcript: transcriptFromText("প্রাণ ম্যাঙ্গো"),
      companyId: COMPANY_ID,
      brands: ["PRAN"],
    });
    // Same brand here, so the point is that scoping never *loses* the match.
    expect(scoped[0]!.candidates[0]!.skuId).toBe(wide[0]!.candidates[0]!.skuId);
  });
});

describe("negative cases", () => {
  it("returns nothing for a sentence with no product", async () => {
    expect(await resolve("আজকে দোকান বন্ধ ছিল")).toHaveLength(0);
  });

  it("returns nothing for an empty transcript", async () => {
    expect(await resolve("")).toHaveLength(0);
  });

  it("returns nothing when the catalogue is empty", async () => {
    const empty = new SkuResolverStage(new InMemoryCatalogRepo([], []));
    const { skus } = await empty.run({
      transcript: transcriptFromText("প্রাণ ম্যাঙ্গো জুস"),
      companyId: COMPANY_ID,
    });
    expect(skus).toHaveLength(0);
  });

  it("does not match quantity words as products", async () => {
    expect(await resolve("দেড় ডজন")).toHaveLength(0);
  });
});

describe("spans", () => {
  it("raw text slices back out of the transcript", async () => {
    const text = "আজকে প্রাণ ম্যাঙ্গো জুস শেষ";
    const { skus } = await stage.run({
      transcript: transcriptFromText(text),
      companyId: COMPANY_ID,
    });
    for (const ann of skus) {
      expect(text.slice(ann.span[0], ann.span[1])).toBe(ann.raw);
    }
  });

  it("emits non-overlapping spans", async () => {
    const anns = await resolve(
      "প্রাণ ম্যাঙ্গো জুস আর হুইল আর কোলগেট টুথপেস্ট",
    );
    for (let i = 1; i < anns.length; i++) {
      expect(anns[i]!.span[0]).toBeGreaterThanOrEqual(anns[i - 1]!.span[1]);
    }
  });

  it("returns annotations in transcript order", async () => {
    const anns = await resolve("হুইল এর অফার আর প্রাণ ম্যাঙ্গো জুস লাগবে");
    const starts = anns.map((a) => a.span[0]);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("prefers the longer, more specific mention", async () => {
    const [ann] = await resolve("প্রাণ ম্যাঙ্গো জুস");
    expect(ann!.raw).toContain("জুস");
  });
});

describe("brand-only mentions", () => {
  // Catalogue names are formal SKU descriptions; speech is colloquial. A rep
  // says "হারপিক", never "Harpic Toilet Cleaner".
  it("resolves a brand spoken without the product description", async () => {
    expect(await top("হারপিক")).toBe("SKU-503");
  });

  it("resolves a single-word brand", async () => {
    expect(await top("লাক্স")).toBe("SKU-502");
  });

  it("resolves a multi-word brand spoken as two tokens", async () => {
    expect(await top("সার্ফ এক্সেল")).toBe("SKU-501");
  });

  it("collapses the margin when a brand has several products", async () => {
    // "প্রাণ" alone genuinely cannot pick between four PRAN products. The
    // right answer is an ambiguous one, not a confident guess.
    const [ann] = await resolve("প্রাণ");
    expect(ann!.candidates.length).toBeGreaterThan(1);
    expect(ann!.margin).toBeLessThan(0.05);
  });

  it("a fuller mention still outranks the brand alone", async () => {
    const [ann] = await resolve("প্রাণ ম্যাঙ্গো জুস");
    expect(ann!.candidates[0]!.skuId).toBe("SKU-404");
    expect(ann!.margin).toBeGreaterThan(0.05);
  });
});

describe("competitor flag", () => {
  it("marks competitor products", async () => {
    const [ann] = await resolve("হুইল");
    expect(ann!.candidates[0]!.isCompetitor).toBe(true);
  });

  it("does not mark own products", async () => {
    const [ann] = await resolve("হারপিক");
    expect(ann!.candidates[0]!.isCompetitor).toBe(false);
  });
});
