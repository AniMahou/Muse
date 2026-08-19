import { describe, it, expect } from "vitest";
import { buildClarifications } from "./builder";
import type { Observation } from "@shared/observation.schema";
import type { Annotations } from "@shared/stage-io";

const NOW = new Date("2026-08-18T10:00:00.000Z");

const annotations: Annotations = {
  quantities: [
    { span: [30, 38], raw: "দেড় ডজন", value: 18, unit: "piece", basis: "1.5 × 12", confidence: 0.7 },
    { span: [70, 79], raw: "বারো", value: 12, unit: "piece", basis: "12", confidence: 0.8 },
  ],
  skus: [
    {
      span: [12, 29],
      raw: "প্রাণ ম্যাঙ্গো",
      margin: 0.02,
      candidates: [
        { skuId: "SKU-404", name: "PRAN Mango Juice", brand: "PRAN", isCompetitor: false, score: 0.93, viaAlias: null },
        { skuId: "SKU-407", name: "PRAN Mango Drink", brand: "PRAN", isCompetitor: false, score: 0.91, viaAlias: null },
      ],
    },
    {
      span: [45, 50],
      raw: "হুইল",
      margin: 0.03,
      candidates: [
        { skuId: "COMP-WHEEL", name: "Wheel", brand: "Wheel", isCompetitor: true, score: 0.8, viaAlias: null },
        { skuId: "COMP-RIN", name: "Rin Powder", brand: "Rin", isCompetitor: true, score: 0.77, viaAlias: null },
      ],
    },
  ],
  outlet: {
    span: [0, 11],
    raw: "বিজয় স্টোর",
    margin: 0.03,
    gpsCandidateCount: 3,
    declared: false,
    candidates: [
      { outletId: "OUT-1182", name: "Bijoy Store", distanceM: 18, nameScore: 0.7, score: 0.79 },
      { outletId: "OUT-1183", name: "Rahman Store", distanceM: 13, nameScore: 0.2, score: 0.76 },
    ],
  },
};

function obs(over: Partial<Observation> = {}): Observation {
  return {
    observationId: "obs_1",
    clipId: "clip_1",
    companyId: "acme",
    repId: "REP-1",
    type: "demand_signal",
    outletId: "OUT-1182",
    skuId: "SKU-404",
    competitorBrand: null,
    quantity: 18,
    unit: "piece",
    priceDelta: null,
    severity: "medium",
    verbatimBn: "…",
    status: "needs_clarification",
    fieldConfidence: { outletId: 0.6, skuId: 0.62, quantity: 0.7 },
    flaggedFields: ["outletId", "skuId", "quantity"],
    recordedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

describe("what becomes a question", () => {
  it("asks only about flagged fields", () => {
    const items = buildClarifications(obs({ flaggedFields: ["outletId"] }), annotations, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.field).toBe("outletId");
  });

  it("asks nothing when nothing is flagged", () => {
    expect(buildClarifications(obs({ flaggedFields: [] }), annotations, NOW)).toHaveLength(0);
  });

  it("skips a field with nothing to choose between", () => {
    // A question with one option is not a question; leave it for HQ review.
    const single: Annotations = {
      ...annotations,
      outlet: { ...annotations.outlet, candidates: [annotations.outlet.candidates[0]!] },
    };
    const items = buildClarifications(obs({ flaggedFields: ["outletId"] }), single, NOW);
    expect(items).toHaveLength(0);
  });

  it("ignores flagged fields that are not askable", () => {
    const items = buildClarifications(obs({ flaggedFields: ["severity"] }), annotations, NOW);
    expect(items).toHaveLength(0);
  });
});

describe("options", () => {
  it("offers outlet candidates by name", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["outletId"] }), annotations, NOW);
    expect(q!.options.map((o) => o.value)).toEqual(["OUT-1182", "OUT-1183"]);
    expect(q!.options[0]!.label).toBe("Bijoy Store");
  });

  it("offers own products for skuId and competitors for competitorBrand", () => {
    const own = buildClarifications(obs({ flaggedFields: ["skuId"] }), annotations, NOW)[0]!;
    expect(own.options.map((o) => o.value)).toEqual(["SKU-404", "SKU-407"]);

    const comp = buildClarifications(
      obs({ flaggedFields: ["competitorBrand"], competitorBrand: "COMP-WHEEL", skuId: null }),
      annotations,
      NOW,
    )[0]!;
    expect(comp.options.map((o) => o.value)).toEqual(["COMP-WHEEL", "COMP-RIN"]);
  });

  it("offers other quantities heard in the same clip", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["quantity"] }), annotations, NOW);
    expect(q!.options.map((o) => o.value)).toEqual([18, 12]);
    expect(q!.options[0]!.label).toBe("18 piece");
  });

  it("caps the option count", () => {
    const [q] = buildClarifications(
      obs({ flaggedFields: ["outletId"] }),
      annotations,
      NOW,
      { maxOptions: 2 },
    );
    expect(q!.options.length).toBeLessThanOrEqual(2);
  });
});

describe("question wording", () => {
  it("names both shops when there are exactly two", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["outletId"] }), annotations, NOW);
    expect(q!.question).toBe("Bijoy Store নাকি Rahman Store?");
  });

  it("names both quantities when there are exactly two", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["quantity"] }), annotations, NOW);
    expect(q!.question).toContain("18 piece");
    expect(q!.question).toContain("12 piece");
  });

  it("falls back to a generic Bangla question with more than two options", () => {
    const many: Annotations = {
      ...annotations,
      outlet: {
        ...annotations.outlet,
        candidates: [
          ...annotations.outlet.candidates,
          { outletId: "OUT-1184", name: "New Alam", distanceM: 20, nameScore: 0.1, score: 0.7 },
        ],
      },
    };
    const [q] = buildClarifications(obs({ flaggedFields: ["outletId"] }), many, NOW);
    expect(q!.question).toBe("কোন দোকান?");
  });
});

describe("prompt metadata", () => {
  it("records the current value and its confidence", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["outletId"] }), annotations, NOW);
    expect(q!.currentValue).toBe("OUT-1182");
    expect(q!.confidence).toBe(0.6);
  });

  it("sets an expiry from the timeout", () => {
    const [q] = buildClarifications(
      obs({ flaggedFields: ["outletId"] }),
      annotations,
      NOW,
      { timeoutHours: 6 },
    );
    expect(q!.expiresAt).toBe(new Date(NOW.getTime() + 6 * 3_600_000).toISOString());
  });

  it("starts pending and unanswered", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["outletId"] }), annotations, NOW);
    expect(q!.status).toBe("pending");
    expect(q!.answeredValue).toBeNull();
    expect(q!.answeredLate).toBe(false);
  });

  it("carries the observation and clip forward for audio replay", () => {
    const [q] = buildClarifications(obs({ flaggedFields: ["outletId"] }), annotations, NOW);
    expect(q!.observationId).toBe("obs_1");
    expect(q!.clipId).toBe("clip_1");
  });

  it("produces one prompt per flagged field", () => {
    const items = buildClarifications(obs(), annotations, NOW);
    expect(items.map((i) => i.field).sort()).toEqual(["outletId", "quantity", "skuId"]);
  });
});
