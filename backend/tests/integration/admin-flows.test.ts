import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { collections, ensureIndexes, type Collections } from "@/db/client";
import { AliasService } from "@/catalog/alias.service";
import { CatalogImportService } from "@/catalog/import.service";
import { ClarificationService } from "@/clarification/service";
import { AnalyticsService } from "@/analytics/service";
import { ObservationRepository } from "@/observations/repository";
import { RealtimeGateway } from "@/realtime/gateway";
import type { SkuAnnotation, Annotations } from "@shared/stage-io";
import type { Observation } from "@shared/observation.schema";

/**
 * Exercises the admin and clarification services against a REAL MongoDB.
 *
 * These are tier-3 integration tests: they need the docker-compose stack. When
 * Mongo is unreachable they skip rather than fail, so the unit suite stays
 * runnable anywhere while this still covers the query and index behaviour that
 * an in-memory double would only pretend to have.
 */
const URI = process.env.MONGO_URI ?? "mongodb://localhost:27018";
const DB = "muse_test";
const CO = "test-co";

let client: MongoClient | null = null;
let db: Db;
let c: Collections;
let available = false;

// Probed at MODULE scope, not in beforeAll: vitest evaluates `describe.skipIf`
// during collection, which happens before any hook runs. Deciding there would
// skip every suite regardless of whether Mongo is actually up.
try {
  client = new MongoClient(URI, { serverSelectionTimeoutMS: 1500 });
  await client.connect();
  db = client.db(DB);
  await ensureIndexes(db);
  c = collections(db);
  available = true;
} catch {
  available = false;
  // eslint-disable-next-line no-console
  console.warn(`\n  [integration] MongoDB unreachable at ${URI} — skipping admin-flow tests.\n`);
}

afterAll(async () => {
  if (client && available) {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

beforeEach(async () => {
  if (!available) return;
  await Promise.all([
    c.aliasCandidates.deleteMany({}),
    c.aliases.deleteMany({}),
    c.skus.deleteMany({}),
    c.outlets.deleteMany({}),
    c.reps.deleteMany({}),
    c.observations.deleteMany({}),
    c.clarifications.deleteMany({}),
  ]);
});

const skip = () => !available;

function ambiguousAnnotation(raw = "হইল"): SkuAnnotation {
  return {
    span: [0, raw.length],
    raw,
    margin: 0.03, // two candidates almost tied — a human decision is needed
    candidates: [
      { skuId: "COMP-WHEEL", name: "Wheel", brand: "Wheel", isCompetitor: true, score: 0.79, viaAlias: null },
      { skuId: "COMP-RIN", name: "Rin Powder", brand: "Rin", isCompetitor: true, score: 0.76, viaAlias: null },
    ],
  };
}

describe.skipIf(skip())("alias harvesting", () => {
  it("records an ambiguous match as a candidate", async () => {
    const svc = new AliasService(c);
    const n = await svc.recordFrom(CO, "clip-1", [ambiguousAnnotation()]);
    expect(n).toBe(1);

    const [cand] = await svc.pending(CO);
    expect(cand!.surface).toBe("হইল");
    expect(cand!.suggestedSkuId).toBe("COMP-WHEEL");
    expect(cand!.occurrences).toBe(1);
  });

  it("does NOT record a confident, unambiguous match", async () => {
    // Nothing to learn: the resolver was sure and right.
    const svc = new AliasService(c);
    const confident: SkuAnnotation = {
      span: [0, 5], raw: "প্রাণ", margin: 0.39,
      candidates: [{ skuId: "SKU-404", name: "PRAN Mango Juice", brand: "PRAN", isCompetitor: false, score: 0.98, viaAlias: null }],
    };
    expect(await svc.recordFrom(CO, "clip-1", [confident])).toBe(0);
    expect(await svc.pending(CO)).toHaveLength(0);
  });

  it("does not re-record a form already resolved through an approved alias", async () => {
    const svc = new AliasService(c);
    const viaAlias: SkuAnnotation = {
      ...ambiguousAnnotation(),
      candidates: [{ ...ambiguousAnnotation().candidates[0]!, viaAlias: "হইল" }],
    };
    expect(await svc.recordFrom(CO, "clip-1", [viaAlias])).toBe(0);
  });

  it("counts repeat hearings instead of duplicating rows", async () => {
    const svc = new AliasService(c);
    for (const clip of ["c1", "c2", "c3"]) {
      await svc.recordFrom(CO, clip, [ambiguousAnnotation()]);
    }
    const pending = await svc.pending(CO);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.occurrences).toBe(3);
    expect(pending[0]!.sampleClipIds).toEqual(["c1", "c2", "c3"]);
  });

  it("caps retained sample clips", async () => {
    const svc = new AliasService(c, { maxSamples: 2 });
    for (const clip of ["c1", "c2", "c3", "c4"]) {
      await svc.recordFrom(CO, clip, [ambiguousAnnotation()]);
    }
    expect((await svc.pending(CO))[0]!.sampleClipIds).toEqual(["c3", "c4"]);
  });

  it("ranks the queue by how often a form was heard", async () => {
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation("রেয়ার")]);
    for (const clip of ["c1", "c2", "c3"]) {
      await svc.recordFrom(CO, clip, [ambiguousAnnotation("কমন")]);
    }
    expect((await svc.pending(CO))[0]!.surface).toBe("কমন");
  });

  it("scopes candidates to one company", async () => {
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation()]);
    await svc.recordFrom("other-co", "c1", [ambiguousAnnotation()]);
    expect(await svc.pending(CO)).toHaveLength(1);
  });
});

describe.skipIf(skip())("alias approval", () => {
  beforeEach(async () => {
    await c.skus.insertMany([
      { skuId: "COMP-WHEEL", companyId: CO, name: "Wheel", brand: "Wheel", isCompetitor: true, active: true },
      { skuId: "COMP-RIN", companyId: CO, name: "Rin Powder", brand: "Rin", isCompetitor: true, active: true },
    ]);
  });

  it("writes an Alias the resolver will use", async () => {
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation()]);
    const [cand] = await svc.pending(CO);

    const alias = await svc.approve(CO, cand!.candidateId, "tabib");
    expect(alias.surface).toBe("হইল");
    expect(alias.skuId).toBe("COMP-WHEEL");
    expect(alias.source).toBe("admin_approved");

    expect(await c.aliases.countDocuments({ companyId: CO })).toBe(1);
    expect(await svc.pending(CO)).toHaveLength(0);
  });

  it("honours an override to a different product", async () => {
    // The point of a human here: they can say "no, that word means this OTHER
    // product", which no amount of phonetic similarity would find.
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation()]);
    const [cand] = await svc.pending(CO);

    const alias = await svc.approve(CO, cand!.candidateId, "tabib", "COMP-RIN");
    expect(alias.skuId).toBe("COMP-RIN");
  });

  it("refuses to approve onto a SKU that does not exist", async () => {
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation()]);
    const [cand] = await svc.pending(CO);
    await expect(svc.approve(CO, cand!.candidateId, "t", "SKU-NOPE")).rejects.toThrow(/not found/i);
  });

  it("refuses to review the same candidate twice", async () => {
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation()]);
    const [cand] = await svc.pending(CO);
    await svc.approve(CO, cand!.candidateId, "t");
    await expect(svc.approve(CO, cand!.candidateId, "t")).rejects.toThrow(/already reviewed/i);
  });

  it("removes a rejected candidate from the queue without writing an alias", async () => {
    const svc = new AliasService(c);
    await svc.recordFrom(CO, "c1", [ambiguousAnnotation()]);
    const [cand] = await svc.pending(CO);
    await svc.reject(CO, cand!.candidateId, "tabib");
    expect(await svc.pending(CO)).toHaveLength(0);
    expect(await c.aliases.countDocuments({})).toBe(0);
  });
});

describe.skipIf(skip())("clarification lifecycle", () => {
  const annotations: Annotations = {
    quantities: [],
    skus: [],
    outlet: {
      span: [0, 5], raw: "স্টোর", margin: 0.02, gpsCandidateCount: 2, declared: false,
      candidates: [
        { outletId: "OUT-1", name: "Bijoy Store", distanceM: 18, nameScore: 0.4, score: 0.72 },
        { outletId: "OUT-2", name: "Rahman Store", distanceM: 12, nameScore: 0.3, score: 0.70 },
      ],
    },
  };

  const observation: Observation = {
    observationId: "obs-1", clipId: "clip-1", companyId: CO, repId: "REP-1",
    type: "demand_signal", outletId: "OUT-1", skuId: null, competitorBrand: null,
    quantity: null, unit: null, priceDelta: null, severity: "medium", verbatimBn: "x",
    status: "needs_clarification", fieldConfidence: { outletId: 0.6 },
    flaggedFields: ["outletId"],
    recordedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function service() {
    const repo = new ObservationRepository(c);
    // No queue: delayed jobs are BullMQ's concern, and autoResolve is called
    // directly here to test the behaviour rather than the scheduler.
    return { svc: new ClarificationService(c, repo, new RealtimeGateway(), null), repo };
  }

  beforeEach(async () => {
    await c.observations.insertOne({ ...observation });
  });

  it("creates a prompt and applies an answer", async () => {
    const { svc } = service();
    const [prompt] = await svc.createFor(observation, annotations);

    const res = await svc.answer(CO, "REP-1", prompt!.clarificationId, "OUT-2");
    expect(res.observation!.outletId).toBe("OUT-2");
    expect(res.observation!.fieldConfidence.outletId).toBe(1);
    expect(res.observation!.flaggedFields).toEqual([]);
    expect(res.observation!.status).toBe("confirmed");
    expect(res.clarification.answeredLate).toBe(false);
  });

  it("rejects a value that was not offered", async () => {
    const { svc } = service();
    const [prompt] = await svc.createFor(observation, annotations);
    await expect(
      svc.answer(CO, "REP-1", prompt!.clarificationId, "OUT-999"),
    ).rejects.toThrow(/not one of the offered options/i);
  });

  it("refuses a second answer", async () => {
    const { svc } = service();
    const [prompt] = await svc.createFor(observation, annotations);
    await svc.answer(CO, "REP-1", prompt!.clarificationId, "OUT-2");
    await expect(
      svc.answer(CO, "REP-1", prompt!.clarificationId, "OUT-1"),
    ).rejects.toThrow(/already answered/i);
  });

  it("auto-resolves on timeout, keeping the best guess and clearing the flag", async () => {
    const { svc, repo } = service();
    const [prompt] = await svc.createFor(observation, annotations);

    await svc.autoResolve(prompt!.clarificationId);

    const after = await repo.getObservation("obs-1");
    expect(after!.outletId).toBe("OUT-1"); // the guess is kept
    expect(after!.flaggedFields).toEqual([]);
    expect(after!.status).toBe("confirmed");

    const stored = await c.clarifications.findOne({ clarificationId: prompt!.clarificationId });
    expect(stored!.status).toBe("auto_resolved"); // but the trail says it was a guess
  });

  it("STILL applies an answer that arrives after auto-resolution", async () => {
    // The edge case that is easy to overlook and expensive to get wrong: the
    // record was already confirmed with a guess and pushed to a dashboard, and
    // a late correction must land rather than be discarded as stale.
    const { svc, repo } = service();
    const [prompt] = await svc.createFor(observation, annotations);

    await svc.autoResolve(prompt!.clarificationId);
    const res = await svc.answer(CO, "REP-1", prompt!.clarificationId, "OUT-2");

    expect(res.clarification.answeredLate).toBe(true);
    expect((await repo.getObservation("obs-1"))!.outletId).toBe("OUT-2");
  });

  it("cancels outstanding prompts once HQ corrects the record", async () => {
    const { svc } = service();
    await svc.createFor(observation, annotations);
    expect(await svc.cancelFor("obs-1")).toBe(1);
    expect(await svc.pendingForRep(CO, "REP-1")).toHaveLength(0);
  });

  it("only shows a rep their own prompts", async () => {
    const { svc } = service();
    await svc.createFor(observation, annotations);
    expect(await svc.pendingForRep(CO, "REP-OTHER")).toHaveLength(0);
  });
});

describe.skipIf(skip())("catalogue import", () => {
  it("imports valid rows and reports the bad ones", async () => {
    const svc = new CatalogImportService(c);
    const report = await svc.importSkus(
      CO,
      "skuId,name,brand\nSKU-1,Lux Soap,Lux\n,Missing Id,X\nSKU-2,Rin,Rin\n",
    );
    expect(report.imported).toBe(2);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]!.row).toBe(3); // 1-based, header counted
  });

  it("upserts rather than duplicating on re-import", async () => {
    const svc = new CatalogImportService(c);
    await svc.importSkus(CO, "skuId,name,brand\nSKU-1,Lux Soap,Lux\n");
    await svc.importSkus(CO, "skuId,name,brand\nSKU-1,Lux Soap 100g,Lux\n");
    const rows = await c.skus.find({ companyId: CO }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Lux Soap 100g");
  });

  it("writes the GeoJSON mirror outlets are queried by", async () => {
    const svc = new CatalogImportService(c);
    await svc.importOutlets(CO, "outletId,name,lat,lng\nOUT-1,Bijoy Store,23.78,90.40\n");
    const doc = await c.outlets.findOne({ outletId: "OUT-1" });
    expect(doc!.location).toEqual({ type: "Point", coordinates: [90.4, 23.78] });
  });

  it("rejects a file missing a required column", async () => {
    const svc = new CatalogImportService(c);
    await expect(svc.importSkus(CO, "name,brand\nLux,Lux\n")).rejects.toThrow(/missing required column/i);
  });

  it("skips rows with unparseable coordinates", async () => {
    const svc = new CatalogImportService(c);
    const report = await svc.importOutlets(
      CO,
      "outletId,name,lat,lng\nOUT-1,A,notanumber,90.4\nOUT-2,B,23.78,90.40\n",
    );
    expect(report.imported).toBe(1);
    expect(report.skipped[0]!.reason).toMatch(/lat\/lng/);
  });

  it("parses a delimited brand portfolio for reps", async () => {
    const svc = new CatalogImportService(c);
    await svc.importReps(CO, "repId,name,brandPortfolio\nR-1,Rahim,PRAN;Lux|Surf Excel\n");
    const rep = await c.reps.findOne({ repId: "R-1" });
    expect(rep!.brandPortfolio).toEqual(["PRAN", "Lux", "Surf Excel"]);
  });
});

describe.skipIf(skip())("analytics", () => {
  const range = { from: "2000-01-01T00:00:00.000Z", to: "2100-01-01T00:00:00.000Z" };

  beforeEach(async () => {
    const base = {
      companyId: CO, repId: "REP-1", clipId: "c1", unit: null, verbatimBn: "x",
      fieldConfidence: { skuId: 0.9 }, flaggedFields: [] as string[],
      recordedAt: "2026-08-18T10:00:00.000Z",
      createdAt: "2026-08-18T10:00:00.000Z", updatedAt: "2026-08-18T10:00:00.000Z",
      status: "confirmed" as const,
    };
    await c.observations.insertMany([
      { ...base, observationId: "o1", type: "competitor_promo", outletId: "OUT-1", skuId: null, competitorBrand: "COMP-WHEEL", quantity: null, priceDelta: -5, severity: "high" },
      { ...base, observationId: "o2", type: "competitor_promo", outletId: "OUT-2", skuId: null, competitorBrand: "COMP-WHEEL", quantity: null, priceDelta: -3, severity: "high" },
      { ...base, observationId: "o3", type: "stock_out", outletId: "OUT-1", skuId: "SKU-1", competitorBrand: null, quantity: null, priceDelta: null, severity: "medium" },
      { ...base, observationId: "o4", type: "stock_out", outletId: "OUT-1", skuId: "SKU-1", competitorBrand: null, quantity: null, priceDelta: null, severity: "medium" },
      { ...base, observationId: "o5", type: "demand_signal", outletId: "OUT-3", skuId: "SKU-2", competitorBrand: null, quantity: 18, priceDelta: null, severity: "low", status: "discarded" as const },
    ]);
  });

  it("counts share of voice by distinct outlet, not just mentions", async () => {
    const rows = await new AnalyticsService(c).shareOfVoice(CO, range);
    expect(rows[0]).toMatchObject({ competitorBrand: "COMP-WHEEL", mentions: 2, outletCount: 2 });
  });

  it("groups stock-outs by outlet and SKU", async () => {
    const rows = await new AnalyticsService(c).stockOuts(CO, range);
    expect(rows[0]).toMatchObject({ outletId: "OUT-1", skuId: "SKU-1", occurrences: 2 });
  });

  it("averages observed price movement", async () => {
    const rows = await new AnalyticsService(c).priceErosion(CO, range);
    expect(rows[0]!.avgDelta).toBe(-4);
    expect(rows[0]!.minDelta).toBe(-5);
  });

  it("excludes discarded records everywhere", async () => {
    const summary = await new AnalyticsService(c).summary(CO, range);
    expect(summary.observations).toBe(4); // o5 is discarded
  });

  it("returns zeroes rather than undefined for an empty window", async () => {
    const summary = await new AnalyticsService(c).summary(CO, {
      from: "1999-01-01T00:00:00.000Z", to: "1999-12-31T00:00:00.000Z",
    });
    expect(summary).toMatchObject({ observations: 0, activeReps: 0 });
  });

  it("scopes every aggregation to one company", async () => {
    const summary = await new AnalyticsService(c).summary("someone-else", range);
    expect(summary.observations).toBe(0);
  });
});
