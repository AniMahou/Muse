import type { Collections } from "@/db/client";

/**
 * What a rep's own reports actually did.
 *
 * The adoption problem this exists to answer. Everything else the rep sees
 * counts their effort — clips recorded, seconds spoken, uploads sent — and
 * the clarification loop actively costs them more of it. They give, they get
 * interrupted, and nothing ever comes back. Field tools die of exactly that,
 * and a field-operations head has watched it happen before.
 *
 * "Twelve reports, three became alerts, HQ acted on two" is the only thing
 * here that is about them rather than about head office.
 */
export interface RepImpact {
  observations: number;
  clips: number;
  outletsCovered: number;
  flagged: number;
  alertsContributed: number;
  alertsActioned: number;
  since: string;
}

export async function repImpact(
  c: Collections,
  companyId: string,
  repId: string,
  days = 7,
): Promise<RepImpact> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [observations, clips, outletsCovered, flagged, mine] = await Promise.all([
    c.observations.countDocuments({ companyId, repId, recordedAt: { $gte: since }, status: { $ne: "discarded" } }),
    c.clips.countDocuments({ companyId, repId, recordedAt: { $gte: since } }),
    c.observations.distinct("outletId", {
      companyId, repId, recordedAt: { $gte: since }, outletId: { $ne: null },
    }),
    c.observations.countDocuments({ companyId, repId, recordedAt: { $gte: since }, status: "needs_clarification" }),
    c.observations
      .find({ companyId, repId, recordedAt: { $gte: since } })
      .project({ _id: 0, observationId: 1 })
      .toArray(),
  ]);

  const ids = mine.map((m) => (m as { observationId: string }).observationId);

  // An alert cites the observations that corroborated it, so "did my report
  // contribute" is an intersection rather than anything the pipeline has to
  // record at capture time.
  const contributing = ids.length === 0
    ? []
    : await c.alerts
        .find({ companyId, observationIds: { $in: ids } })
        .project({ _id: 0, status: 1 })
        .toArray();

  return {
    observations,
    clips,
    outletsCovered: outletsCovered.length,
    flagged,
    alertsContributed: contributing.length,
    alertsActioned: contributing.filter((a) => a.status === "acknowledged").length,
    since,
  };
}
