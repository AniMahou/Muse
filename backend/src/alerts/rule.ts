import type { Alert, AlertKind } from "@shared/alert.schema";
import type { ObservationCore, Severity } from "@shared/observation.schema";

/**
 * When several outlets agreeing becomes something worth telling a human.
 *
 * Pure, and separate from the service for the same reason the clarification
 * builder is: deciding to interrupt somebody is the part worth testing
 * exhaustively, and it should be testable without a database.
 */

export interface WindowRow {
  observationId: string;
  outletId: string;
  severity: Severity;
  recordedAt: string;
}

/** One outlet's earliest sighting within the window. */
export interface OutletSighting {
  outletId: string;
  recordedAt: string;
}

export interface Corroboration {
  kind: AlertKind;
  key: string;
  outlets: OutletSighting[];
  outletIds: string[];
  observationIds: string[];
  severity: Severity;
  firstSeenAt: string;
}

const RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/**
 * The (kind, key) an observation contributes to, or null if it cannot corroborate.
 *
 * Only market conditions that several outlets can independently witness
 * qualify. A demand signal belongs to one shop — two shops ordering juice is
 * not a pattern, it is Tuesday — and a complaint is one retailer's opinion.
 * Both are valuable data; neither is evidence of anything beyond itself.
 */
export function keyFor(obs: ObservationCore): { kind: AlertKind; key: string } | null {
  switch (obs.type) {
    case "competitor_promo":
      return obs.competitorBrand ? { kind: "competitor_promo", key: obs.competitorBrand } : null;
    case "stock_out":
      return obs.skuId ? { kind: "stock_out", key: obs.skuId } : null;
    case "price_change":
      return obs.skuId ? { kind: "price_change", key: obs.skuId } : null;
    default:
      return null;
  }
}

/**
 * Fold a window of observations into one corroboration.
 *
 * Deduplicates by outlet deliberately. The unit of evidence is a shop, not a
 * recording — otherwise one talkative rep revisiting the same outlet four
 * times could raise an alert by himself, which is exactly the false positive
 * that teaches people to ignore alerts.
 */
export function corroborationFrom(
  kind: AlertKind,
  key: string,
  rows: WindowRow[],
): Corroboration | null {
  if (rows.length === 0) return null;

  const earliest = new Map<string, string>();
  let severity: Severity = "low";

  for (const r of rows) {
    const seen = earliest.get(r.outletId);
    if (seen === undefined || r.recordedAt < seen) earliest.set(r.outletId, r.recordedAt);
    if (RANK[r.severity] > RANK[severity]) severity = r.severity;
  }

  const outlets = [...earliest.entries()]
    .map(([outletId, recordedAt]) => ({ outletId, recordedAt }))
    .sort((a, b) => (a.outletId < b.outletId ? -1 : 1));

  return {
    kind,
    key,
    outlets,
    outletIds: outlets.map((o) => o.outletId),
    observationIds: [...new Set(rows.map((r) => r.observationId))].sort(),
    severity,
    firstSeenAt: outlets.reduce((min, o) => (o.recordedAt < min ? o.recordedAt : min), outlets[0]!.recordedAt),
  };
}

export type Decision =
  | { action: "none" }
  | { action: "create"; corroboration: Corroboration }
  | { action: "update"; corroboration: Corroboration };

/**
 * Raise, extend, or stay quiet.
 *
 * Three cases, and the third is what stops this becoming a spam generator:
 *
 *  - nothing open, enough outlets   → raise
 *  - already open                   → extend it, never raise a second
 *  - closed, outlets still arriving → stay quiet unless enough outlets have
 *                                     reported SINCE it was closed
 *
 * That last rule matters more than it looks. Without it, acknowledging an
 * alert would immediately re-raise it from the very evidence somebody just
 * finished dealing with, and the first thing anyone would learn is that
 * acknowledging does nothing.
 *
 * An alert that grows from three outlets to eleven is more informative than
 * eleven alerts, so extending is always preferred to raising again.
 */
export function decide(
  existing: Pick<Alert, "status" | "updatedAt"> | null,
  corroboration: Corroboration | null,
  minOutlets: number,
): Decision {
  if (!corroboration) return { action: "none" };

  if (existing?.status === "open") return { action: "update", corroboration };

  if (existing) {
    const since = existing.updatedAt;
    const fresh = corroboration.outlets.filter((o) => o.recordedAt > since);
    return fresh.length >= minOutlets ? { action: "create", corroboration } : { action: "none" };
  }

  return corroboration.outletIds.length >= minOutlets
    ? { action: "create", corroboration }
    : { action: "none" };
}
