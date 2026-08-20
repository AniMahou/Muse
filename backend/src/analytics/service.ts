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

  /**
   * Daily volume, split by capture source.
   *
   * Fills gaps with zeroes rather than omitting them, so a sparse week draws
   * a truthful flat line instead of a chart that silently compresses time.
   */
  async trend(companyId: string, range: Range, days = 14) {
    const rows = await this.c.observations
      .aggregate([
        { $match: this.base(companyId, range) },
        {
          $group: {
            _id: { day: { $substr: ["$recordedAt", 0, 10] } },
            observations: { $sum: 1 },
            flagged: { $sum: { $cond: [{ $eq: ["$status", "needs_clarification"] }, 1, 0] } },
          },
        },
        { $project: { _id: 0, day: "$_id.day", observations: 1, flagged: 1 } },
      ])
      .toArray();

    const byDay = new Map(rows.map((r) => [r.day as string, r]));
    const out: Array<{ day: string; observations: number; flagged: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const hit = byDay.get(d);
      out.push({
        day: d,
        observations: (hit?.observations as number) ?? 0,
        flagged: (hit?.flagged as number) ?? 0,
      });
    }
    return out;
  }

  /**
   * How the confidence gate is behaving, bucketed.
   *
   * The shape of this histogram is the honest answer to "does your confidence
   * mean anything" — a system that scores everything 0.9 is not measuring, it
   * is asserting.
   */
  async confidenceDistribution(companyId: string, range: Range) {
    const rows = await this.c.observations
      .aggregate([
        { $match: this.base(companyId, range) },
        {
          $project: {
            mean: { $avg: { $map: { input: { $objectToArray: "$fieldConfidence" }, as: "f", in: "$$f.v" } } },
          },
        },
        {
          $bucket: {
            groupBy: "$mean",
            boundaries: [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.01],
            default: "other",
            output: { count: { $sum: 1 } },
          },
        },
      ])
      .toArray();

    const labels: Record<string, string> = {
      "0": "<50", "0.5": "50-60", "0.6": "60-70",
      "0.7": "70-80", "0.8": "80-90", "0.9": "90-100",
    };
    return rows.map((r) => ({
      band: labels[String(r._id)] ?? String(r._id),
      count: r.count as number,
    }));
  }

  /**
   * What actually ran, read back from processed clips.
   *
   * Reported from the clips themselves rather than from configuration,
   * because the two drift: config says what SHOULD run, this says what did.
   */
  async pipelineStats(companyId: string, range: Range) {
    const clips = await this.c.clips
      .find({ companyId, status: "processed", recordedAt: { $gte: range.from, $lte: range.to } })
      .toArray();

    if (clips.length === 0) {
      return {
        clips: 0, voice: 0, photo: 0, simulated: 0,
        extractors: [] as Array<{ name: string; model: string; count: number; simulated: boolean }>,
        llm: null as { provider: string; model: string } | null,
        avgExtractionConfidence: null as number | null,
        stageTimings: [] as Array<{ stage: string; avgMs: number; p95Ms: number }>,
      };
    }

    const byExtractor = new Map<string, { name: string; model: string; count: number; simulated: boolean }>();
    const timings = new Map<string, number[]>();
    let confSum = 0;
    let confN = 0;

    for (const c of clips) {
      const p = c.pipeline;
      if (!p) continue;
      const key = `${p.extractor}/${p.extractorModel}`;
      const hit = byExtractor.get(key);
      if (hit) hit.count++;
      else byExtractor.set(key, { name: p.extractor, model: p.extractorModel, count: 1, simulated: p.simulated });

      if (typeof p.extractionConfidence === "number") {
        confSum += p.extractionConfidence;
        confN++;
      }
      for (const [stage, ms] of Object.entries(p.timings ?? {})) {
        const arr = timings.get(stage) ?? [];
        arr.push(ms);
        timings.set(stage, arr);
      }
    }

    const first = clips.find((c) => c.pipeline)?.pipeline;

    return {
      clips: clips.length,
      voice: clips.filter((c) => c.source !== "photo").length,
      photo: clips.filter((c) => c.source === "photo").length,
      simulated: clips.filter((c) => c.pipeline?.simulated).length,
      extractors: [...byExtractor.values()].sort((a, b) => b.count - a.count),
      llm: first ? { provider: first.llmProvider, model: first.llmModel } : null,
      avgExtractionConfidence: confN > 0 ? round(confSum / confN) : null,
      stageTimings: [...timings.entries()]
        .map(([stage, arr]) => {
          const sorted = [...arr].sort((a, b) => a - b);
          return {
            stage,
            avgMs: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
            p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
          };
        })
        .sort((a, b) => a.stage.localeCompare(b.stage)),
    };
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

function round(n: number, dp = 3): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
