import type { Collections } from "@/db/client";

export interface Range {
  from: string;
  to: string;
}

/**
 * Aggregations behind the Intelligence screen.
 *
 * Every one of these answers a question a brand manager already asks and
 * currently cannot get answered — which is the product, more than the capture
 * pipeline is.
 *
 * All queries are company-scoped and exclude discarded records. Records still
 * awaiting clarification ARE included, deliberately: "12 shops, 3 unconfirmed"
 * is useful, whereas silently dropping uncertain data would make the numbers
 * quietly wrong.
 */
export class AnalyticsService {
  constructor(private readonly c: Collections) {}

  private base(companyId: string, range: Range) {
    return {
      companyId,
      status: { $ne: "discarded" as const },
      recordedAt: { $gte: range.from, $lte: range.to },
    };
  }

  /**
   * Competitor share of voice.
   *
   * How often each rival is mentioned, and how many distinct outlets mentioned
   * them. The outlet count matters more than the raw count — one talkative rep
   * repeating himself is not a market movement.
   */
  async shareOfVoice(companyId: string, range: Range) {
    return this.c.observations
      .aggregate([
        { $match: { ...this.base(companyId, range), competitorBrand: { $ne: null } } },
        {
          $group: {
            _id: "$competitorBrand",
            mentions: { $sum: 1 },
            outlets: { $addToSet: "$outletId" },
            highSeverity: { $sum: { $cond: [{ $eq: ["$severity", "high"] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            competitorBrand: "$_id",
            mentions: 1,
            outletCount: { $size: "$outlets" },
            highSeverity: 1,
          },
        },
        { $sort: { mentions: -1 } },
      ])
      .toArray();
  }

  /** Stock-outs by outlet and SKU — the grid behind the heatmap. */
  async stockOuts(companyId: string, range: Range) {
    return this.c.observations
      .aggregate([
        { $match: { ...this.base(companyId, range), type: "stock_out" } },
        {
          $group: {
            _id: { outletId: "$outletId", skuId: "$skuId" },
            occurrences: { $sum: 1 },
            lastSeen: { $max: "$recordedAt" },
          },
        },
        {
          $project: {
            _id: 0,
            outletId: "$_id.outletId",
            skuId: "$_id.skuId",
            occurrences: 1,
            lastSeen: 1,
          },
        },
        { $sort: { occurrences: -1 } },
      ])
      .toArray();
  }

  /**
   * Observed price movement per product.
   *
   * Reported deltas rather than a price list: what a rep hears in a shop is
   * "five taka less", not an absolute figure, and the movement is the signal
   * anyway.
   */
  async priceErosion(companyId: string, range: Range) {
    return this.c.observations
      .aggregate([
        { $match: { ...this.base(companyId, range), priceDelta: { $ne: null } } },
        {
          $group: {
            _id: { skuId: "$skuId", competitorBrand: "$competitorBrand" },
            avgDelta: { $avg: "$priceDelta" },
            minDelta: { $min: "$priceDelta" },
            reports: { $sum: 1 },
            outlets: { $addToSet: "$outletId" },
          },
        },
        {
          $project: {
            _id: 0,
            skuId: "$_id.skuId",
            competitorBrand: "$_id.competitorBrand",
            avgDelta: { $round: ["$avgDelta", 2] },
            minDelta: 1,
            reports: 1,
            outletCount: { $size: "$outlets" },
          },
        },
        { $sort: { avgDelta: 1 } },
      ])
      .toArray();
  }

  /**
   * Per-rep activity and mean confidence.
   *
   * The confidence column is a genuine operations signal, not a scoreboard: a
   * consistently low rep usually means a strong regional dialect, a failing
   * phone microphone, or recording in a noisy market — all of them fixable,
   * and none of them the rep's fault.
   */
  async repCoverage(companyId: string, range: Range) {
    return this.c.observations
      .aggregate([
        { $match: this.base(companyId, range) },
        {
          $project: {
            repId: 1,
            outletId: 1,
            clipId: 1,
            needsClarification: { $cond: [{ $eq: ["$status", "needs_clarification"] }, 1, 0] },
            meanConf: { $avg: { $map: { input: { $objectToArray: "$fieldConfidence" }, as: "f", in: "$$f.v" } } },
          },
        },
        {
          $group: {
            _id: "$repId",
            observations: { $sum: 1 },
            clips: { $addToSet: "$clipId" },
            outlets: { $addToSet: "$outletId" },
            flagged: { $sum: "$needsClarification" },
            avgConfidence: { $avg: "$meanConf" },
          },
        },
        {
          $project: {
            _id: 0,
            repId: "$_id",
            observations: 1,
            clipCount: { $size: "$clips" },
            outletCount: { $size: "$outlets" },
            flagged: 1,
            avgConfidence: { $round: ["$avgConfidence", 3] },
          },
        },
        { $sort: { observations: -1 } },
      ])
      .toArray();
  }

  /** Volume by observation type — the shape of what the field is reporting. */
  async typeBreakdown(companyId: string, range: Range) {
    return this.c.observations
      .aggregate([
        { $match: this.base(companyId, range) },
        {
          $group: {
            _id: { type: "$type", severity: "$severity" },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, type: "$_id.type", severity: "$_id.severity", count: 1 } },
        { $sort: { count: -1 } },
      ])
      .toArray();
  }

  /** Counters for the Today screen. */
  async summary(companyId: string, range: Range) {
    const [row] = await this.c.observations
      .aggregate([
        { $match: this.base(companyId, range) },
        {
          $group: {
            _id: null,
            observations: { $sum: 1 },
            clips: { $addToSet: "$clipId" },
            reps: { $addToSet: "$repId" },
            outlets: { $addToSet: "$outletId" },
            needsClarification: {
              $sum: { $cond: [{ $eq: ["$status", "needs_clarification"] }, 1, 0] },
            },
            highSeverity: { $sum: { $cond: [{ $eq: ["$severity", "high"] }, 1, 0] } },
          },
        },
        {
          $project: {
            _id: 0,
            observations: 1,
            clipCount: { $size: "$clips" },
            activeReps: { $size: "$reps" },
            outletsCovered: { $size: "$outlets" },
            needsClarification: 1,
            highSeverity: 1,
          },
        },
      ])
      .toArray();

    return (
      row ?? {
        observations: 0,
        clipCount: 0,
        activeReps: 0,
        outletsCovered: 0,
        needsClarification: 0,
        highSeverity: 0,
      }
    );
  }
}
