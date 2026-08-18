import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AssembleStage } from "./index";
import { buildAssemblySchema, vocabularyFrom } from "./schema";
import { renderUserPrompt } from "./prompt";
import { FakeLlmProvider } from "@/adapters/llm/fake.adapter";
import { transcriptFromText } from "@/common/transcript";
import type { Annotations } from "@shared/stage-io";

const TRANSCRIPT =
  "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে আর হুইল এর নতুন অফার দিছে পাঁচ টাকা কম";

const ANNOTATIONS: Annotations = {
  quantities: [
    { span: [30, 38], raw: "দেড় ডজন", value: 18, unit: "piece", basis: "1.5 × 12", confidence: 1 },
    { span: [70, 79], raw: "পাঁচ টাকা", value: 5, unit: "BDT", basis: "5", confidence: 1 },
  ],
  skus: [
    {
      span: [12, 29],
      raw: "প্রাণ ম্যাঙ্গো জুস",
      margin: 0.23,
      candidates: [
        { skuId: "SKU-404", name: "PRAN Mango Juice", brand: "PRAN", isCompetitor: false, score: 0.94, viaAlias: null },
        { skuId: "SKU-407", name: "PRAN Mango Drink", brand: "PRAN", isCompetitor: false, score: 0.71, viaAlias: null },
      ],
    },
    {
      span: [45, 50],
      raw: "হুইল",
      margin: 0.24,
      candidates: [
        { skuId: "COMP-WHEEL", name: "Wheel", brand: "Wheel", isCompetitor: true, score: 0.79, viaAlias: null },
      ],
    },
  ],
  outlet: {
    span: [0, 11],
    raw: "বিজয় স্টোরে",
    margin: 0.41,
    gpsCandidateCount: 3,
    declared: false,
    candidates: [
      { outletId: "OUT-1182", name: "Bijoy Store", distanceM: 18, nameScore: 0.88, score: 0.83 },
    ],
  },
};

const EMPTY: Annotations = {
  quantities: [],
  skus: [],
  outlet: { span: null, raw: null, candidates: [], margin: 0, gpsCandidateCount: 0, declared: false },
};

/** Model reply the fixtures treat as "correct". */
const GOOD_REPLY = {
  observations: [
    {
      type: "demand_signal",
      outletId: "OUT-1182",
      skuId: "SKU-404",
      competitorBrand: null,
      quantity: 18,
      unit: "piece",
      priceDelta: null,
      severity: "medium",
      verbatimBn: "প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে",
    },
    {
      type: "competitor_promo",
      outletId: "OUT-1182",
      skuId: null,
      competitorBrand: "COMP-WHEEL",
      quantity: null,
      unit: null,
      priceDelta: -5,
      severity: "high",
      verbatimBn: "হুইল এর নতুন অফার দিছে পাঁচ টাকা কম",
    },
  ],
};

function stageReturning(reply: unknown) {
  const llm = new FakeLlmProvider({ handler: () => reply });
  return { stage: new AssembleStage(llm), llm };
}

async function assemble(reply: unknown, annotations: Annotations = ANNOTATIONS) {
  const { stage } = stageReturning(reply);
  return stage.run({ transcript: transcriptFromText(TRANSCRIPT), annotations });
}

describe("vocabulary", () => {
  it("separates own products from competitors", () => {
    const v = vocabularyFrom(ANNOTATIONS);
    expect(v.skuIds).toEqual(["SKU-404", "SKU-407"]);
    expect(v.competitorBrands).toEqual(["COMP-WHEEL"]);
    expect(v.outletIds).toEqual(["OUT-1182"]);
  });

  it("is empty when nothing resolved", () => {
    const v = vocabularyFrom(EMPTY);
    expect(v.skuIds).toEqual([]);
    expect(v.outletIds).toEqual([]);
  });
});

describe("the per-request enum lock", () => {
  it("accepts an id that stage 3 actually produced", () => {
    const schema = buildAssemblySchema(vocabularyFrom(ANNOTATIONS));
    const ok = schema.safeParse(GOOD_REPLY);
    expect(ok.success).toBe(true);
  });

  it("REJECTS an id no resolver produced", () => {
    // The heart of the design: a product that was never resolved is not
    // expressible in this clip's schema, so hallucinating one cannot parse.
    const schema = buildAssemblySchema(vocabularyFrom(ANNOTATIONS));
    const bad = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    bad.observations[0]!.skuId = "SKU-999-INVENTED";
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects an outlet no resolver produced", () => {
    const schema = buildAssemblySchema(vocabularyFrom(ANNOTATIONS));
    const bad = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    bad.observations[0]!.outletId = "OUT-NOWHERE";
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("rejects putting a competitor id in the own-product field", () => {
    const schema = buildAssemblySchema(vocabularyFrom(ANNOTATIONS));
    const bad = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    bad.observations[0]!.skuId = "COMP-WHEEL";
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("collapses to null-only when nothing resolved", () => {
    const schema = buildAssemblySchema(vocabularyFrom(EMPTY));
    expect(
      schema.safeParse({
        observations: [
          { type: "retailer_complaint", outletId: null, skuId: null, competitorBrand: null,
            quantity: null, unit: null, priceDelta: null, severity: "low", verbatimBn: "দোকান বন্ধ" },
        ],
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        observations: [
          { type: "retailer_complaint", outletId: "OUT-1182", skuId: null, competitorBrand: null,
            quantity: null, unit: null, priceDelta: null, severity: "low", verbatimBn: "x" },
        ],
      }).success,
    ).toBe(false);
  });

  it("still rejects an unknown observation type", () => {
    const schema = buildAssemblySchema(vocabularyFrom(ANNOTATIONS));
    const bad = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    bad.observations[0]!.type = "invented_type";
    expect(schema.safeParse(bad).success).toBe(false);
  });
});

describe("assembly", () => {
  it("returns every observation the model produced", async () => {
    const out = await assemble(GOOD_REPLY);
    expect(out.observations).toHaveLength(2);
    expect(out.observations[0]!.skuId).toBe("SKU-404");
    expect(out.observations[1]!.competitorBrand).toBe("COMP-WHEEL");
  });

  it("handles a recording containing nothing reportable", async () => {
    const out = await assemble({ observations: [] });
    expect(out.observations).toEqual([]);
  });

  it("keeps the speaker's own words untranslated", async () => {
    const out = await assemble(GOOD_REPLY);
    expect(out.observations[0]!.verbatimBn).toContain("দেড় ডজন");
  });

  it("passes the dynamic schema to the provider", async () => {
    const { stage, llm } = stageReturning(GOOD_REPLY);
    await stage.run({ transcript: transcriptFromText(TRANSCRIPT), annotations: ANNOTATIONS });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.schemaName).toBe("MuseAssembly");
    expect(llm.calls[0]!.temperature).toBe(0);
  });
});

describe("numeric enforcement", () => {
  it("keeps a quantity the grammar actually parsed", async () => {
    const out = await assemble(GOOD_REPLY);
    expect(out.observations[0]!.quantity).toBe(18);
    expect(out.rejectedValues).toHaveLength(0);
  });

  it("DROPS a quantity the grammar never produced", async () => {
    // The schema cannot constrain a float the way it constrains an id, so a
    // model that converts 18 pieces back into "1.5 dozen" must be caught here.
    const reply = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    reply.observations[0]!.quantity = 1.5;
    const out = await assemble(reply);
    expect(out.observations[0]!.quantity).toBeNull();
    expect(out.observations[0]!.unit).toBeNull();
    expect(out.rejectedValues[0]).toMatchObject({ field: "quantity", value: 1.5 });
  });

  it("drops an invented quantity for a field nobody spoke", async () => {
    const reply = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    reply.observations[1]!.quantity = 100;
    const out = await assemble(reply);
    expect(out.observations[1]!.quantity).toBeNull();
  });

  it("accepts a negative price delta whose magnitude was parsed", async () => {
    // "পাঁচ টাকা কম" parses as 5; the observation means -5.
    const out = await assemble(GOOD_REPLY);
    expect(out.observations[1]!.priceDelta).toBe(-5);
  });

  it("drops a price delta whose magnitude was never parsed", async () => {
    const reply = structuredClone(GOOD_REPLY) as { observations: Array<Record<string, unknown>> };
    reply.observations[1]!.priceDelta = -12;
    const out = await assemble(reply);
    expect(out.observations[1]!.priceDelta).toBeNull();
    expect(out.rejectedValues.some((r) => r.field === "priceDelta")).toBe(true);
  });

  it("leaves nulls alone", async () => {
    const out = await assemble(GOOD_REPLY);
    expect(out.observations[0]!.priceDelta).toBeNull();
    expect(out.rejectedValues).toHaveLength(0);
  });
});

describe("prompt", () => {
  const vocab = vocabularyFrom(ANNOTATIONS);
  const prompt = renderUserPrompt(transcriptFromText(TRANSCRIPT), ANNOTATIONS, vocab);

  it("includes the transcript", () => expect(prompt).toContain(TRANSCRIPT));

  it("lists every candidate with its score", () => {
    expect(prompt).toContain("SKU-404");
    expect(prompt).toContain("SKU-407");
    expect(prompt).toContain("0.94");
  });

  it("marks competitors distinctly", () => expect(prompt).toContain("COMPETITOR"));

  it("shows the derivation of each parsed quantity", () => {
    expect(prompt).toContain("1.5 × 12");
    expect(prompt).toContain("18");
  });

  it("states the allowed values explicitly", () => {
    expect(prompt).toContain("SKU-404, SKU-407, or null");
  });

  it("says null-only when nothing resolved", () => {
    const p = renderUserPrompt(transcriptFromText("কিছু না"), EMPTY, vocabularyFrom(EMPTY));
    expect(p).toContain("null only");
  });

  it("flags a declared outlet as authoritative", () => {
    const declared: Annotations = {
      ...ANNOTATIONS,
      outlet: { ...ANNOTATIONS.outlet, declared: true },
    };
    expect(renderUserPrompt(transcriptFromText(TRANSCRIPT), declared, vocab)).toContain(
      "confirmed this outlet",
    );
  });
});

describe("provider contract", () => {
  it("surfaces a reply that violates the schema rather than passing it on", async () => {
    const llm = new FakeLlmProvider({ handler: () => ({ observations: [{ nonsense: true }] }) });
    const stage = new AssembleStage(llm);
    await expect(
      stage.run({ transcript: transcriptFromText(TRANSCRIPT), annotations: ANNOTATIONS }),
    ).rejects.toThrow(/schema/i);
  });

  it("builds a schema that is a Zod object", () => {
    expect(buildAssemblySchema(vocabularyFrom(ANNOTATIONS))).toBeInstanceOf(z.ZodObject);
  });
});
