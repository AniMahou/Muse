import { describe, it, expect } from "vitest";
import { corroborationFrom, decide, keyFor, type WindowRow } from "./rule";
import { responseSeconds } from "@shared/alert.schema";
import type { ObservationCore } from "@shared/observation.schema";

const obs = (over: Partial<ObservationCore> = {}): ObservationCore => ({
  type: "competitor_promo",
  outletId: "OUT-1182",
  skuId: null,
  competitorBrand: "COMP-WHEEL",
  quantity: null,
  unit: null,
  priceDelta: -5,
  severity: "high",
  verbatimBn: "হুইল নতুন অফার",
  ...over,
});

const row = (outletId: string, at: string, over: Partial<WindowRow> = {}): WindowRow => ({
  observationId: `obs_${outletId}_${at}`,
  outletId,
  severity: "medium",
  recordedAt: at,
  ...over,
});

describe("keyFor", () => {
  it("routes each corroborating type to the field the outlets agree on", () => {
    expect(keyFor(obs())).toEqual({ kind: "competitor_promo", key: "COMP-WHEEL" });
    expect(keyFor(obs({ type: "stock_out", competitorBrand: null, skuId: "SKU-502" })))
      .toEqual({ kind: "stock_out", key: "SKU-502" });
    expect(keyFor(obs({ type: "price_change", competitorBrand: null, skuId: "SKU-501" })))
      .toEqual({ kind: "price_change", key: "SKU-501" });
  });

  it("refuses the types that cannot corroborate", () => {
    // Two shops ordering juice is not a market event, and a complaint is one
    // retailer's opinion. Both are useful data; neither is evidence.
    expect(keyFor(obs({ type: "demand_signal", skuId: "SKU-404" }))).toBeNull();
    expect(keyFor(obs({ type: "retailer_complaint" }))).toBeNull();
    expect(keyFor(obs({ type: "posm_issue" }))).toBeNull();
  });

  it("refuses an observation whose key field never resolved", () => {
    expect(keyFor(obs({ competitorBrand: null }))).toBeNull();
    expect(keyFor(obs({ type: "stock_out", competitorBrand: null, skuId: null }))).toBeNull();
  });
});

describe("corroborationFrom", () => {
  it("counts outlets, not observations", () => {
    // The false positive that teaches people to ignore alerts: one talkative
    // rep revisiting one shop four times must not raise anything.
    const c = corroborationFrom("competitor_promo", "COMP-WHEEL", [
      row("OUT-1182", "2026-08-26T09:00:00.000Z"),
      row("OUT-1182", "2026-08-26T11:00:00.000Z"),
      row("OUT-1182", "2026-08-26T13:00:00.000Z"),
      row("OUT-1182", "2026-08-26T15:00:00.000Z"),
    ])!;
    expect(c.outletIds).toEqual(["OUT-1182"]);
    expect(c.observationIds).toHaveLength(4);
    expect(decide(null, c, 3).action).toBe("none");
  });

  it("takes the worst severity and the earliest sighting", () => {
    const c = corroborationFrom("stock_out", "SKU-502", [
      row("OUT-1183", "2026-08-26T12:00:00.000Z", { severity: "low" }),
      row("OUT-1182", "2026-08-26T08:00:00.000Z", { severity: "high" }),
      row("OUT-1184", "2026-08-26T10:00:00.000Z", { severity: "medium" }),
    ])!;
    expect(c.severity).toBe("high");
    expect(c.firstSeenAt).toBe("2026-08-26T08:00:00.000Z");
    expect(c.outletIds).toEqual(["OUT-1182", "OUT-1183", "OUT-1184"]);
  });

  it("is null for an empty window", () => {
    expect(corroborationFrom("stock_out", "SKU-502", [])).toBeNull();
  });
});

describe("decide", () => {
  const three = corroborationFrom("competitor_promo", "COMP-WHEEL", [
    row("OUT-1182", "2026-08-26T09:00:00.000Z"),
    row("OUT-1183", "2026-08-26T10:00:00.000Z"),
    row("OUT-1184", "2026-08-26T11:00:00.000Z"),
  ])!;

  it("raises once the threshold is met", () => {
    expect(decide(null, three, 3).action).toBe("create");
  });

  it("stays quiet below the threshold", () => {
    expect(decide(null, three, 4).action).toBe("none");
  });

  it("extends an open alert instead of raising a second", () => {
    // Eleven outlets on one alert is more informative than eleven alerts.
    const d = decide({ status: "open", updatedAt: "2026-08-26T10:30:00.000Z" }, three, 3);
    expect(d.action).toBe("update");
  });

  it("extends an open alert even when the window has fallen below threshold", () => {
    const one = corroborationFrom("competitor_promo", "COMP-WHEEL", [
      row("OUT-1182", "2026-08-26T09:00:00.000Z"),
    ])!;
    expect(decide({ status: "open", updatedAt: "2026-08-26T09:30:00.000Z" }, one, 3).action)
      .toBe("update");
  });

  it("does not re-raise from evidence that was already answered", () => {
    // Without this, acknowledging an alert would instantly re-raise it from
    // the very reports somebody just finished dealing with, and the first
    // thing anyone would learn is that acknowledging does nothing.
    const d = decide({ status: "acknowledged", updatedAt: "2026-08-26T12:00:00.000Z" }, three, 3);
    expect(d.action).toBe("none");
  });

  it("re-raises when enough NEW outlets report after it was answered", () => {
    const resurgence = corroborationFrom("competitor_promo", "COMP-WHEEL", [
      row("OUT-1182", "2026-08-26T09:00:00.000Z"),
      row("OUT-1183", "2026-08-27T09:00:00.000Z"),
      row("OUT-1184", "2026-08-27T10:00:00.000Z"),
      row("OUT-1185", "2026-08-27T11:00:00.000Z"),
    ])!;
    const d = decide({ status: "acknowledged", updatedAt: "2026-08-26T12:00:00.000Z" }, resurgence, 3);
    expect(d.action).toBe("create");
  });

  it("treats a dismissed alert the same as an acknowledged one", () => {
    expect(decide({ status: "dismissed", updatedAt: "2026-08-26T12:00:00.000Z" }, three, 3).action)
      .toBe("none");
  });

  it("is silent with nothing to go on", () => {
    expect(decide(null, null, 3).action).toBe("none");
  });
});

describe("responseSeconds", () => {
  it("measures the gap a pilot would be scored on", () => {
    expect(responseSeconds({
      raisedAt: "2026-08-26T09:40:00.000Z",
      acknowledgedAt: "2026-08-26T10:15:00.000Z",
    })).toBe(2100);
  });

  it("is null while nobody has responded", () => {
    expect(responseSeconds({ raisedAt: "2026-08-26T09:40:00.000Z", acknowledgedAt: null })).toBeNull();
  });
});
