import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Observation } from "@shared/observation.schema";
import { api } from "@/shared/lib/api";
import { useAuth } from "@/shared/lib/auth-store";
import { ConfidenceRing, StatusPill } from "@/shared/ui/Confidence";
import { connectRealtime, onObservations, disconnectRealtime } from "./lib/socket";
import { useDirectory, formatDelta } from "./lib/directory";
import { AlertPanel, ResponseStat } from "./Alerts";

interface Summary {
  observations: number; clipCount: number; activeReps: number;
  outletsCovered: number; needsClarification: number; highSeverity: number;
}

export function Today() {
  const companyId = useAuth((s) => s.user?.companyId);
  const [live, setLive] = useState<Observation[]>([]);

  const { data: summary } = useQuery({
    queryKey: ["summary"],
    queryFn: () => api.get<Summary>("/admin/analytics/summary"),
    refetchInterval: 30_000,
  });

  const { data: feed } = useQuery({
    queryKey: ["observations"],
    queryFn: () => api.get<{ observations: Observation[] }>("/admin/observations?limit=40"),
  });

  useEffect(() => {
    if (!companyId) return;
    connectRealtime(companyId);
    // New rows arrive over the socket and are prepended, so the feed is live
    // without polling. The query above is only the initial fill.
    const off = onObservations((rows) => setLive((prev) => [...rows, ...prev].slice(0, 60)));
    return () => { off(); disconnectRealtime(); };
  }, [companyId]);

  const rows = [...live, ...(feed?.observations ?? [])].slice(0, 60);

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-bold mb-1">Today</h1>
      <p className="text-ink-soft mb-8">
        Live field intelligence across your team.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-10">
        <Kpi label="Observations" value={summary?.observations ?? 0} />
        <Kpi label="Clips" value={summary?.clipCount ?? 0} />
        <Kpi label="Active reps" value={summary?.activeReps ?? 0} />
        <Kpi label="Outlets" value={summary?.outletsCovered ?? 0} />
        <Kpi label="Needs review" value={summary?.needsClarification ?? 0} tone="uncertain" />
        <ResponseStat />
      </div>

      {/* Above the feed, deliberately. What needs a decision outranks what
          merely happened, and an alert you have to scroll to is not an alert. */}
      <AlertPanel compact />

      <div className="flex items-center gap-2 mb-4">
        <span className="h-2 w-2 rounded-full bg-confident animate-pulse" />
        <h2 className="font-display text-lg font-semibold">Live feed</h2>
      </div>

      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="glass p-10 text-center text-ink-muted">
            Nothing yet. Recordings from the field appear here as they are processed.
          </div>
        )}
        {rows.map((o) => <ObservationCard key={o.observationId} o={o} />)}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "uncertain" | "critical" }) {
  return (
    <div className="glass px-4 py-4">
      <p className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">{label}</p>
      <p className={`stat-number text-3xl ${
        tone === "uncertain" ? "text-uncertain" : tone === "critical" ? "text-critical" : "text-ink"
      }`}>
        {value}
      </p>
    </div>
  );
}

export function ObservationCard({ o }: { o: Observation }) {
  const dir = useDirectory();
  const flagged = o.flaggedFields.length > 0;
  const meanConf =
    Object.values(o.fieldConfidence).reduce((a, b) => a + b, 0) /
    Math.max(1, Object.values(o.fieldConfidence).length);

  return (
    <div className={`glass p-5 flex items-start gap-5 animate-fade-up
                     ${flagged ? "border-l-2 border-l-uncertain" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="rounded-md bg-accent/15 text-accent px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
            {o.type.replace(/_/g, " ")}
          </span>
          <StatusPill status={o.status} />
          {o.severity === "high" && (
            <span className="rounded-md bg-critical/15 text-critical px-2 py-0.5 text-[11px] font-medium">
              high
            </span>
          )}
        </div>

        <p className="font-bn text-base leading-relaxed text-ink-soft mb-3 line-clamp-2">
          “{o.verbatimBn}”
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {o.outletId && <Field label="Outlet" value={dir.outlet(o.outletId)} flagged={o.flaggedFields.includes("outletId")} />}
          {o.skuId && <Field label="Product" value={dir.sku(o.skuId)} flagged={o.flaggedFields.includes("skuId")} />}
          {o.competitorBrand && <Field label="Competitor" value={dir.sku(o.competitorBrand)} flagged={o.flaggedFields.includes("competitorBrand")} />}
          {o.quantity !== null && <Field label="Qty" value={`${o.quantity}${o.unit ? ` ${o.unit}` : ""}`} flagged={o.flaggedFields.includes("quantity")} />}
          {o.priceDelta !== null && <Field label="Price" value={formatDelta(o.priceDelta)} flagged={false} />}
        </div>
      </div>

      <ConfidenceRing value={meanConf} />
    </div>
  );
}

function Field({ label, value, flagged }: { label: string; value: string; flagged: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-ink-muted text-xs">{label}</span>
      <span className={`font-medium ${flagged ? "text-uncertain" : ""}`}>{value}</span>
      {flagged && <span className="text-uncertain text-xs">?</span>}
    </span>
  );
}
