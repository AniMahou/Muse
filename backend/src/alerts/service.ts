import { randomUUID } from "node:crypto";
import type { Alert, AlertKind } from "@shared/alert.schema";
import { responseSeconds } from "@shared/alert.schema";
import type { Observation } from "@shared/observation.schema";
import type { Collections } from "@/db/client";
import type { RealtimeGateway } from "@/realtime/gateway";
import { logger } from "@/common/logger";
import { corroborationFrom, decide, keyFor, type WindowRow } from "./rule";

export interface AlertOptions {
  /** Distinct outlets that must agree before anyone is interrupted. */
  minOutlets: number;
  /** How far back corroboration counts. */
  windowHours: number;
}

/** The observation field each alert kind agrees on. */
const KEY_FIELD: Record<AlertKind, "competitorBrand" | "skuId"> = {
  competitor_promo: "competitorBrand",
  stock_out: "skuId",
  price_change: "skuId",
};

/**
 * Turns corroborated observations into something a human is asked to act on.
 *
 * This is the step the product was missing. Everything upstream captures and
 * structures; a brand manager still had to be looking at a dashboard at the
 * moment a card appeared to learn anything. Muse's whole pitch is "tell me on
 * Tuesday instead of October", and until this existed the system told nobody
 * anything — it waited to be visited.
 */
export class AlertService {
  constructor(
    private readonly c: Collections,
    private readonly realtime: RealtimeGateway,
    private readonly opts: AlertOptions,
  ) {}

  /**
   * Called after a clip's observations are saved.
   *
   * Never throws into the caller. A clip whose data was captured perfectly
   * must not be marked failed because the alerting layer had a bad day —
   * alerting is a consumer of the pipeline, not a stage in it.
   */
  async evaluate(companyId: string, observations: Observation[]): Promise<Alert[]> {
    const pairs = new Map<string, { kind: AlertKind; key: string }>();
    for (const obs of observations) {
      const k = keyFor(obs);
      // No outlet means no corroboration is possible: the unit of evidence is
      // a shop, and we do not know which shop this was.
      if (k && obs.outletId) pairs.set(`${k.kind}|${k.key}`, k);
    }
    if (pairs.size === 0) return [];

    const raised: Alert[] = [];
    for (const { kind, key } of pairs.values()) {
      try {
        const alert = await this.evaluateOne(companyId, kind, key);
        if (alert) raised.push(alert);
      } catch (err) {
        logger.error({ err, companyId, kind, key }, "alert evaluation failed");
      }
    }

    for (const a of raised) this.realtime.alertRaised(companyId, a);
    return raised;
  }

  private async evaluateOne(companyId: string, kind: AlertKind, key: string): Promise<Alert | null> {
    const since = new Date(Date.now() - this.opts.windowHours * 3_600_000).toISOString();

    const rows = (await this.c.observations
      .find({
        companyId,
        type: kind,
        [KEY_FIELD[kind]]: key,
        outletId: { $ne: null },
        status: { $ne: "discarded" },
        recordedAt: { $gte: since },
      })
      .project({ _id: 0, observationId: 1, outletId: 1, severity: 1, recordedAt: 1 })
      .toArray()) as unknown as WindowRow[];

    const corroboration = corroborationFrom(kind, key, rows);

    const existing = await this.c.alerts.findOne(
      { companyId, kind, key },
      { sort: { raisedAt: -1 } },
    );

    const decision = decide(existing, corroboration, this.opts.minOutlets);
    if (decision.action === "none") return null;

    const now = new Date().toISOString();
    const corr = decision.corroboration;

    if (decision.action === "update" && existing) {
      const updated = await this.c.alerts.findOneAndUpdate(
        { alertId: existing.alertId },
        {
          $set: {
            outletIds: corr.outletIds,
            observationIds: corr.observationIds,
            severity: corr.severity,
            firstSeenAt: corr.firstSeenAt,
            updatedAt: now,
          },
        },
        { returnDocument: "after" },
      );
      // Only worth re-announcing when the evidence actually grew.
      return updated && updated.outletIds.length > existing.outletIds.length ? updated : null;
    }

    const alert: Alert = {
      alertId: `alt_${randomUUID()}`,
      companyId,
      kind,
      key,
      outletIds: corr.outletIds,
      observationIds: corr.observationIds,
      severity: corr.severity,
      firstSeenAt: corr.firstSeenAt,
      raisedAt: now,
      status: "open",
      acknowledgedAt: null,
      acknowledgedBy: null,
      note: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.c.alerts.insertOne(alert);
    logger.info(
      { companyId, kind, key, outlets: corr.outletIds.length, severity: corr.severity },
      "alert raised",
    );
    return alert;
  }

  async list(companyId: string, opts: { status?: Alert["status"]; limit?: number } = {}): Promise<Alert[]> {
    return this.c.alerts
      .find({ companyId, ...(opts.status ? { status: opts.status } : {}) })
      .sort({ status: 1, raisedAt: -1 })
      .limit(Math.min(opts.limit ?? 50, 200))
      .toArray();
  }

  /**
   * A human takes ownership. This is what stops the clock.
   *
   * Dismissing stops it too, and on purpose: "we looked and decided not to
   * act" is a real response, and counting it as a non-response would push the
   * median towards rewarding people for acting on things that did not merit it.
   */
  async respond(
    companyId: string,
    alertId: string,
    status: Extract<Alert["status"], "acknowledged" | "dismissed">,
    by: string,
    note?: string,
  ): Promise<Alert | null> {
    const now = new Date().toISOString();
    const updated = await this.c.alerts.findOneAndUpdate(
      { alertId, companyId, status: "open" },
      { $set: { status, acknowledgedAt: now, acknowledgedBy: by, note: note ?? null, updatedAt: now } },
      { returnDocument: "after" },
    );
    if (updated) this.realtime.alertUpdated(companyId, updated);
    return updated ?? null;
  }

  /**
   * How long signals sit before a human takes them.
   *
   * The median, not the mean — one alert raised on a Friday evening and
   * answered on Monday would drag a mean far enough to hide a team that is
   * otherwise responding within the hour.
   */
  async responsiveness(companyId: string, sinceIso?: string) {
    const rows = await this.c.alerts
      .find({ companyId, ...(sinceIso ? { raisedAt: { $gte: sinceIso } } : {}) })
      .project({ _id: 0, raisedAt: 1, acknowledgedAt: 1, status: 1 })
      .toArray();

    const answered = rows
      .map((r) => responseSeconds(r as Pick<Alert, "raisedAt" | "acknowledgedAt">))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    const median =
      answered.length === 0
        ? null
        : answered.length % 2 === 1
          ? answered[(answered.length - 1) / 2]!
          : (answered[answered.length / 2 - 1]! + answered[answered.length / 2]!) / 2;

    return {
      raised: rows.length,
      open: rows.filter((r) => r.status === "open").length,
      answered: answered.length,
      medianResponseSec: median === null ? null : Math.round(median),
    };
  }
}
