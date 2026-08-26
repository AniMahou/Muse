import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { MongoClient, type Db } from "mongodb";
import { collections, ensureIndexes, type Collections } from "@/db/client";
import { AlertService } from "@/alerts/service";
import { repImpact } from "@/alerts/impact";
import { RealtimeGateway } from "@/realtime/gateway";
import type { Observation } from "@shared/observation.schema";

/**
 * Tier-3: the alert layer against a REAL MongoDB.
 *
 * The rule is unit-tested in src/alerts/test.ts; almost everything left in the
 * service is a query — a time window, a $ne on a nullable field, the dedupe
 * lookup — and an in-memory double would only pretend to have that behaviour.
 * Skips when the docker-compose stack is not up.
 */
const URI = process.env.MONGO_URI ?? "mongodb://localhost:27018";
const DB = "muse_test_alerts";
const CO = "test-co";

let client: MongoClient | null = null;
let db: Db;
let c: Collections;
let available = false;

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
  console.warn(`\n  [integration] MongoDB unreachable at ${URI} — skipping alert tests.\n`);
}

afterAll(async () => {
  if (client && available) {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

beforeEach(async () => {
  if (!available) return;
  await Promise.all([c.observations.deleteMany({}), c.alerts.deleteMany({}), c.clips.deleteMany({})]);
});

const skip = () => !available;

let seq = 0;
function obs(over: Partial<Observation> = {}): Observation {
  seq++;
  const now = new Date().toISOString();
  return {
    observationId: `obs_${seq}`,
    clipId: `clip_${seq}`,
    companyId: CO,
    repId: "REP-1",
    type: "competitor_promo",
    outletId: "OUT-1182",
    skuId: null,
    competitorBrand: "COMP-WHEEL",
    quantity: null,
    unit: null,
    priceDelta: -5,
    severity: "high",
    verbatimBn: "হুইল নতুন অফার",
    status: "confirmed",
    fieldConfidence: {},
    flaggedFields: [],
    recordedAt: now,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function service() {
  return new AlertService(c, new RealtimeGateway(), { minOutlets: 3, windowHours: 24 });
}

async function seed(rows: Observation[]) {
  await c.observations.insertMany(rows);
  return rows;
}

describe.skipIf(skip())("alert raising", () => {
  it("stays silent until enough distinct outlets agree", async () => {
    const svc = service();
    const two = await seed([obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" })]);
    expect(await svc.evaluate(CO, two)).toHaveLength(0);
    expect(await c.alerts.countDocuments({})).toBe(0);
  });

  it("raises once three outlets agree", async () => {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" }), obs({ outletId: "OUT-1184" }),
    ]);
    const raised = await svc.evaluate(CO, rows);
    expect(raised).toHaveLength(1);
    expect(raised[0]!.kind).toBe("competitor_promo");
    expect(raised[0]!.key).toBe("COMP-WHEEL");
    expect(raised[0]!.outletIds).toHaveLength(3);
    expect(raised[0]!.status).toBe("open");
  });

  it("does not let one outlet corroborate itself", async () => {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1182" }),
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1182" }),
    ]);
    expect(await svc.evaluate(CO, rows)).toHaveLength(0);
  });

  it("ignores observations outside the window", async () => {
    const svc = service();
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const rows = await seed([
      obs({ outletId: "OUT-1182", recordedAt: old }),
      obs({ outletId: "OUT-1183", recordedAt: old }),
      obs({ outletId: "OUT-1184" }),
    ]);
    expect(await svc.evaluate(CO, rows)).toHaveLength(0);
  });

  it("ignores discarded observations", async () => {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" }),
      obs({ outletId: "OUT-1184", status: "discarded" }),
    ]);
    expect(await svc.evaluate(CO, rows)).toHaveLength(0);
  });

  it("cannot corroborate without an outlet", async () => {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" }),
      obs({ outletId: null }), obs({ outletId: null }),
    ]);
    expect(await svc.evaluate(CO, rows)).toHaveLength(0);
  });

  it("extends an open alert instead of raising a second", async () => {
    const svc = service();
    const first = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" }), obs({ outletId: "OUT-1184" }),
    ]);
    await svc.evaluate(CO, first);

    const more = await seed([obs({ outletId: "OUT-1185" })]);
    await svc.evaluate(CO, more);

    expect(await c.alerts.countDocuments({})).toBe(1);
    const [only] = await c.alerts.find({}).toArray();
    expect(only!.outletIds).toHaveLength(4);
  });

  it("keeps separate alerts for different keys", async () => {
    const svc = service();
    const promo = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" }), obs({ outletId: "OUT-1184" }),
    ]);
    const stock = await seed([
      obs({ type: "stock_out", competitorBrand: null, skuId: "SKU-502", outletId: "OUT-1182" }),
      obs({ type: "stock_out", competitorBrand: null, skuId: "SKU-502", outletId: "OUT-1183" }),
      obs({ type: "stock_out", competitorBrand: null, skuId: "SKU-502", outletId: "OUT-1184" }),
    ]);
    await svc.evaluate(CO, [...promo, ...stock]);
    expect(await c.alerts.countDocuments({})).toBe(2);
  });

  it("does not leak across tenants", async () => {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182" }),
      obs({ outletId: "OUT-1183", companyId: "other-co" }),
      obs({ outletId: "OUT-1184", companyId: "other-co" }),
    ]);
    expect(await svc.evaluate(CO, rows)).toHaveLength(0);
  });
});

describe.skipIf(skip())("responding", () => {
  async function raised() {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182" }), obs({ outletId: "OUT-1183" }), obs({ outletId: "OUT-1184" }),
    ]);
    const [a] = await svc.evaluate(CO, rows);
    return { svc, alert: a! };
  }

  it("stops the clock and records who", async () => {
    const { svc, alert } = await raised();
    const done = await svc.respond(CO, alert.alertId, "acknowledged", "brand-manager");
    expect(done!.status).toBe("acknowledged");
    expect(done!.acknowledgedBy).toBe("brand-manager");
    expect(done!.acknowledgedAt).not.toBeNull();
  });

  it("refuses a second response to the same alert", async () => {
    // Two people clicking the same card must not both succeed.
    const { svc, alert } = await raised();
    expect(await svc.respond(CO, alert.alertId, "acknowledged", "a")).not.toBeNull();
    expect(await svc.respond(CO, alert.alertId, "dismissed", "b")).toBeNull();
  });

  it("refuses across tenants", async () => {
    const { svc, alert } = await raised();
    expect(await svc.respond("other-co", alert.alertId, "acknowledged", "x")).toBeNull();
  });

  it("does not re-raise from evidence that was already answered", async () => {
    const { svc, alert } = await raised();
    await svc.respond(CO, alert.alertId, "acknowledged", "brand-manager");
    const more = await seed([obs({ outletId: "OUT-1185" })]);
    await svc.evaluate(CO, more);
    expect(await c.alerts.countDocuments({})).toBe(1);
  });

  it("reports median response time", async () => {
    const { svc, alert } = await raised();
    await svc.respond(CO, alert.alertId, "acknowledged", "bm");
    const stats = await svc.responsiveness(CO);
    expect(stats.raised).toBe(1);
    expect(stats.answered).toBe(1);
    expect(stats.open).toBe(0);
    expect(stats.medianResponseSec).not.toBeNull();
  });

  it("has no median before anyone responds", async () => {
    await raised();
    const stats = await service().responsiveness(CO);
    expect(stats.medianResponseSec).toBeNull();
    expect(stats.open).toBe(1);
  });
});

describe.skipIf(skip())("rep impact", () => {
  it("counts what a rep's own reports became", async () => {
    const svc = service();
    const rows = await seed([
      obs({ outletId: "OUT-1182", repId: "REP-1" }),
      obs({ outletId: "OUT-1183", repId: "REP-1" }),
      obs({ outletId: "OUT-1184", repId: "REP-2" }),
    ]);
    const [alert] = await svc.evaluate(CO, rows);
    await svc.respond(CO, alert!.alertId, "acknowledged", "bm");

    const impact = await repImpact(c, CO, "REP-1");
    expect(impact.observations).toBe(2);
    expect(impact.outletsCovered).toBe(2);
    expect(impact.alertsContributed).toBe(1);
    expect(impact.alertsActioned).toBe(1);
  });

  it("is all zeroes for a rep who has reported nothing", async () => {
    const impact = await repImpact(c, CO, "REP-NOBODY");
    expect(impact.observations).toBe(0);
    expect(impact.alertsContributed).toBe(0);
  });
});
