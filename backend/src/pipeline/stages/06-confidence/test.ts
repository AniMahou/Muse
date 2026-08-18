import { describe, it, expect } from "vitest";
import { ConfidenceStage } from "./index";
import { transcriptFromText } from "@/common/transcript";
import type { Annotations, Transcript } from "@shared/stage-io";
import type { ObservationCore } from "@shared/observation.schema";

const TEXT = "বিজয় স্টোরে প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে";

function transcript(conf = 0.95): Transcript {
  return transcriptFromText(TEXT, { conf });
}

function annotations(over: Partial<Annotations> = {}): Annotations {
  const skuSpan: [number, number] = [12, 30];
  const qtySpan: [number, number] = [31, 39];
  return {
    quantities: [
      { span: qtySpan, raw: "দেড় ডজন", value: 18, unit: "piece", basis: "1.5 × 12", confidence: 1 },
    ],
    skus: [
      {
        span: skuSpan,
        raw: "প্রাণ ম্যাঙ্গো জুস",
        margin: 0.4,
        candidates: [
          { skuId: "SKU-404", name: "PRAN Mango Juice", brand: "PRAN", isCompetitor: false, score: 0.94, viaAlias: null },
          { skuId: "SKU-407", name: "PRAN Mango Drink", brand: "PRAN", isCompetitor: false, score: 0.54, viaAlias: null },
        ],
      },
    ],
    outlet: {
      span: [0, 11],
      raw: "বিজয় স্টোরে",
      margin: 0.45,
      gpsCandidateCount: 3,
      declared: false,
      candidates: [
        { outletId: "OUT-1182", name: "Bijoy Store", distanceM: 18, nameScore: 0.9, score: 0.86 },
        { outletId: "OUT-1183", name: "Rahman Store", distanceM: 13, nameScore: 0.3, score: 0.41 },
      ],
    },
    ...over,
  };
}

const OBS: ObservationCore = {
  type: "demand_signal",
  outletId: "OUT-1182",
  skuId: "SKU-404",
  competitorBrand: null,
  quantity: 18,
  unit: "piece",
  priceDelta: null,
  severity: "medium",
  verbatimBn: "প্রাণ ম্যাঙ্গো জুস দেড় ডজন লাগবে",
};

function score(
  obs: Partial<ObservationCore> = {},
  anns: Annotations = annotations(),
  t: Transcript = transcript(),
  stage = new ConfidenceStage(),
) {
  return stage.run({ transcript: t, annotations: anns, observations: [{ ...OBS, ...obs }] })
    .observations[0]!;
}

describe("clean case", () => {
  it("confirms when every critical field is well supported", () => {
    const r = score();
    expect(r.status).toBe("confirmed");
    expect(r.flaggedFields).toEqual([]);
  });

  it("scores every populated field", () => {
    const r = score();
    for (const f of ["outletId", "skuId", "quantity", "unit", "severity", "type"]) {
      expect(r.fieldConfidence[f]).toBeGreaterThan(0);
    }
  });

  it("does not score null fields", () => {
    // A field nobody filled has nothing to be uncertain about; scoring it
    // would flag every observation for everything it did not mention.
    const r = score();
    expect(r.fieldConfidence.competitorBrand).toBeUndefined();
    expect(r.fieldConfidence.priceDelta).toBeUndefined();
  });

  it("keeps all confidences within 0..1", () => {
    const r = score();
    for (const v of Object.values(r.fieldConfidence)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("the margin term", () => {
  it("flags a SKU whose rival is one point behind, despite a high top score", () => {
    // This is the case scoring on the top value alone would confirm: the
    // resolver is 'confident' and simultaneously cannot tell two products
    // apart. The margin is what exposes it.
    const tied = annotations({
      skus: [
        {
          span: [12, 30],
          raw: "প্রাণ ম্যাঙ্গো",
          margin: 0.01,
          candidates: [
            { skuId: "SKU-404", name: "PRAN Mango Juice", brand: "PRAN", isCompetitor: false, score: 0.93, viaAlias: null },
            { skuId: "SKU-407", name: "PRAN Mango Drink", brand: "PRAN", isCompetitor: false, score: 0.92, viaAlias: null },
          ],
        },
      ],
    });
    const r = score({}, tied);
    expect(r.status).toBe("needs_clarification");
    expect(r.flaggedFields).toContain("skuId");
  });

  it("confidence rises monotonically with the margin", () => {
    const low = score({}, annotations({ skus: [{ ...annotations().skus[0]!, margin: 0 }] }));
    const high = score({}, annotations({ skus: [{ ...annotations().skus[0]!, margin: 0.5 }] }));
    expect(high.fieldConfidence.skuId!).toBeGreaterThan(low.fieldConfidence.skuId!);
  });

  it("flags an outlet the GPS cluster cannot separate", () => {
    const ambiguous = annotations({
      outlet: {
        span: null,
        raw: null,
        margin: 0.02,
        gpsCandidateCount: 3,
        declared: false,
        candidates: [
          { outletId: "OUT-1182", name: "Bijoy Store", distanceM: 18, nameScore: 0, score: 0.85 },
          { outletId: "OUT-1183", name: "Rahman Store", distanceM: 13, nameScore: 0, score: 0.83 },
        ],
      },
    });
    const r = score({}, ambiguous);
    expect(r.flaggedFields).toContain("outletId");
  });
});

describe("ASR confidence feeds through", () => {
  it("poor audio over the product span flags the SKU", () => {
    const t = transcript(0.95);
    // Degrade only the words inside the product mention.
    for (const w of t.words) {
      if (w.span[0] >= 12 && w.span[1] <= 30) w.conf = 0.25;
    }
    const r = score({}, annotations(), t);
    expect(r.fieldConfidence.skuId!).toBeLessThan(0.8);
    expect(r.flaggedFields).toContain("skuId");
  });

  it("poor audio elsewhere leaves the SKU alone", () => {
    const t = transcript(0.95);
    for (const w of t.words) {
      if (w.span[0] >= 31) w.conf = 0.2; // the quantity, not the product
    }
    const r = score({}, annotations(), t);
    expect(r.flaggedFields).not.toContain("skuId");
    expect(r.flaggedFields).toContain("quantity");
  });
});

describe("grammar confidence feeds through", () => {
  it("a fuzzily-recovered quantity scores lower than a canonical one", () => {
    const canonical = score();
    const fuzzy = score(
      {},
      annotations({
        quantities: [
          { span: [31, 39], raw: "দের ডজন", value: 18, unit: "piece", basis: "1.5 × 12", confidence: 0.68 },
        ],
      }),
    );
    expect(fuzzy.fieldConfidence.quantity!).toBeLessThan(canonical.fieldConfidence.quantity!);
  });

  it("the unit inherits its quantity's confidence", () => {
    const r = score();
    expect(r.fieldConfidence.unit).toBe(r.fieldConfidence.quantity);
  });
});

describe("declared outlet", () => {
  it("is fully trusted — the rep already answered", () => {
    const declared = annotations({
      outlet: { ...annotations().outlet, declared: true, margin: 0 },
    });
    const r = score({}, declared);
    expect(r.fieldConfidence.outletId).toBe(1);
    expect(r.flaggedFields).not.toContain("outletId");
  });
});

describe("approved aliases", () => {
  it("bypass the margin penalty", () => {
    const viaAlias = annotations({
      skus: [
        {
          span: [12, 30],
          raw: "চানাচুর",
          margin: 0.0,
          candidates: [
            { skuId: "SKU-404", name: "PRAN Chanachur", brand: "PRAN", isCompetitor: false, score: 0.9, viaAlias: "চানাচুর" },
          ],
        },
      ],
    });
    const r = score({}, viaAlias);
    // Zero margin would normally flag this; a human already decided.
    expect(r.fieldConfidence.skuId!).toBeGreaterThan(0.8);
  });
});

describe("unsupported values", () => {
  it("scores zero for a SKU no annotation supports", () => {
    const r = score({ skuId: "SKU-NOT-RESOLVED" });
    expect(r.fieldConfidence.skuId).toBe(0);
    expect(r.flaggedFields).toContain("skuId");
  });

  it("scores zero for a quantity the grammar never produced", () => {
    const r = score({ quantity: 999 });
    expect(r.fieldConfidence.quantity).toBe(0);
  });

  it("scores zero for an outlet when nothing resolved", () => {
    const none = annotations({
      outlet: { span: null, raw: null, candidates: [], margin: 0, gpsCandidateCount: 0, declared: false },
    });
    expect(score({}, none).fieldConfidence.outletId).toBe(0);
  });
});

describe("criticality", () => {
  it("does not flag non-critical fields", () => {
    // severity always scores below 1, but getting it wrong costs nothing.
    const r = score();
    expect(r.fieldConfidence.severity!).toBeLessThan(1);
    expect(r.flaggedFields).not.toContain("severity");
  });

  it("accepts snake_case and camelCase field names alike", () => {
    const snake = new ConfidenceStage({ criticalFields: ["sku", "outlet_id"] });
    const camel = new ConfidenceStage({ criticalFields: ["skuId", "outletId"] });
    const anns = annotations({ skus: [{ ...annotations().skus[0]!, margin: 0 }] });
    expect(score({}, anns, transcript(), snake).flaggedFields).toEqual(
      score({}, anns, transcript(), camel).flaggedFields,
    );
  });

  it("honours a custom threshold", () => {
    const strict = new ConfidenceStage({ threshold: 0.999 });
    expect(score({}, annotations(), transcript(), strict).status).toBe("needs_clarification");
    const lax = new ConfidenceStage({ threshold: 0.01 });
    expect(score({}, annotations(), transcript(), lax).status).toBe("confirmed");
  });
});

describe("data is never discarded", () => {
  it("a flagged observation is still returned in full", () => {
    const r = score({ skuId: "SKU-NOT-RESOLVED" });
    expect(r.status).toBe("needs_clarification");
    expect(r.skuId).toBe("SKU-NOT-RESOLVED");
    expect(r.quantity).toBe(18);
    expect(r.verbatimBn).toBe(OBS.verbatimBn);
  });

  it("scores every observation in a multi-observation clip", () => {
    const stage = new ConfidenceStage();
    const out = stage.run({
      transcript: transcript(),
      annotations: annotations(),
      observations: [OBS, { ...OBS, skuId: "SKU-NOT-RESOLVED" }],
    });
    expect(out.observations).toHaveLength(2);
    expect(out.observations[0]!.status).toBe("confirmed");
    expect(out.observations[1]!.status).toBe("needs_clarification");
  });

  it("handles an empty observation list", () => {
    const stage = new ConfidenceStage();
    expect(stage.run({ transcript: transcript(), annotations: annotations(), observations: [] })
      .observations).toEqual([]);
  });
});
