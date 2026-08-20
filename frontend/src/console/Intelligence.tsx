import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";
import { useDirectory, formatDelta } from "./lib/directory";
import { AreaChart, BarChart, Donut, StatRow, SimulatedBadge } from "@/shared/ui/Charts";
import { ConfidenceBar } from "@/shared/ui/Confidence";

interface Voice { competitorBrand: string; mentions: number; outletCount: number; highSeverity: number }
interface Price { skuId: string | null; competitorBrand: string | null; avgDelta: number; minDelta: number; reports: number; outletCount: number }
interface Coverage { repId: string; observations: number; clipCount: number; outletCount: number; flagged: number; avgConfidence: number }
interface TypeRow { type: string; severity: string; count: number }
interface TrendRow { day: string; observations: number; flagged: number }
interface ConfRow { band: string; count: number }
interface Pipeline {
  clips: number; voice: number; photo: number; simulated: number;
  extractors: Array<{ name: string; model: string; count: number; simulated: boolean }>;
  llm: { provider: string; model: string } | null;
  avgExtractionConfidence: number | null;
  stageTimings: Array<{ stage: string; avgMs: number; p95Ms: number }>;
}

export function Intelligence() {
  const dir = useDirectory();
  const rows = <T,>(key: string, path: string) =>
    useQuery({ queryKey: [key], queryFn: () => api.get<{ rows: T[] }>(path) });

  const voice = rows<Voice>("sov", "/admin/analytics/share-of-voice");
  const price = rows<Price>("price", "/admin/analytics/price-erosion");
  const cover = rows<Coverage>("coverage", "/admin/analytics/rep-coverage");
  const types = rows<TypeRow>("types", "/admin/analytics/types");
  const trend = rows<TrendRow>("trend", "/admin/analytics/trend");
  const conf = rows<ConfRow>("conf", "/admin/analytics/confidence");
  const pipe = useQuery({
    queryKey: ["pipeline"],
    queryFn: () => api.get<Pipeline>("/admin/analytics/pipeline"),
  });

  const p = pipe.data;
  const typeRows = types.data?.rows ?? [];
  const total = typeRows.reduce((a, r) => a + r.count, 0);

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-bold mb-1">Intelligence</h1>
      <p className="text-ink-soft mb-8">What the field has been telling you.</p>

      {/* ---- capture volume ------------------------------------------- */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Panel className="lg:col-span-2" title="Capture volume"
               hint="Solid line is observations captured; dashed is the share the system flagged as uncertain.">
          <AreaChart
            data={(trend.data?.rows ?? []).map((r) => ({
              label: r.day.slice(5), value: r.observations, secondary: r.flagged,
            }))}
          />
        </Panel>

        <Panel title="How it was captured">
          <Donut segments={[
            { label: "Voice notes", value: p?.voice ?? 0, tone: "accent" },
            { label: "Photographed notes", value: p?.photo ?? 0, tone: "uncertain" },
          ]} />
          {(p?.photo ?? 0) > 0 && (
            <p className="mt-5 text-xs text-ink-muted leading-relaxed">
              Photo capture runs the same grammar, resolver and confidence gate
              as voice — only text extraction differs.
            </p>
          )}
        </Panel>
      </div>

      {/* ---- models ---------------------------------------------------- */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Panel title="Models in use"
               hint="Read back from processed clips, not from configuration — the two drift.">
          {p?.extractors.length ? (
            <>
              {p.extractors.map((e) => (
                <div key={e.name + e.model} className="py-2.5 border-b border-line/40 last:border-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-sm font-medium">{e.name}</span>
                    <span className="flex items-center gap-2">
                      {e.simulated && <SimulatedBadge />}
                      <span className="text-xs tabular-nums text-ink-muted">{e.count} clips</span>
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-ink-muted">{e.model}</p>
                </div>
              ))}
              {p.llm && (
                <div className="py-2.5">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-sm font-medium">{p.llm.provider}</span>
                    <span className="text-xs text-ink-muted">assembly</span>
                  </div>
                  <p className="font-mono text-[11px] text-ink-muted">{p.llm.model}</p>
                </div>
              )}
            </>
          ) : <Empty />}
        </Panel>

        <Panel title="Stage latency"
               hint="Measured per clip. Extraction and assembly are network calls; everything else is local.">
          {p?.stageTimings.length ? p.stageTimings.map((s) => (
            <StatRow key={s.stage} label={s.stage}
                     value={`${s.avgMs} ms`} hint={`p95 ${s.p95Ms} ms`} />
          )) : <Empty />}
        </Panel>

        <Panel title="Extraction quality">
          {p ? (
            <>
              <div className="mb-5">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm text-ink-muted">Mean confidence</span>
                  <span className="stat-number text-2xl">
                    {p.avgExtractionConfidence !== null
                      ? (p.avgExtractionConfidence * 100).toFixed(0)
                      : "—"}
                  </span>
                </div>
                {p.avgExtractionConfidence !== null && (
                  <ConfidenceBar value={p.avgExtractionConfidence} />
                )}
              </div>
              <StatRow label="Clips processed" value={String(p.clips)} />
              <StatRow label="Voice" value={String(p.voice)} />
              <StatRow label="Photo" value={String(p.photo)} />
              {p.simulated > 0 && (
                <div className="mt-4 rounded-xl border border-uncertain/30 bg-uncertain/10 p-3">
                  <p className="text-[11px] text-uncertain leading-relaxed">
                    {p.simulated} clip{p.simulated === 1 ? "" : "s"} used simulated
                    text extraction. Everything downstream of extraction is real.
                  </p>
                </div>
              )}
            </>
          ) : <Empty />}
        </Panel>
      </div>

      {/* ---- confidence + types ---------------------------------------- */}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Panel title="Confidence distribution"
               hint="A system that scores everything above 90 is asserting, not measuring.">
          <BarChart
            data={(conf.data?.rows ?? []).map((r) => ({
              label: r.band, value: r.count,
              tone: r.band === "<50" || r.band === "50-60" ? "critical"
                : r.band === "60-70" || r.band === "70-80" ? "uncertain" : "confident",
            }))}
          />
        </Panel>

        <Panel title="What is being reported">
          <BarChart
            data={typeRows.map((r) => ({
              label: r.type.replace(/_/g, " ").slice(0, 12),
              value: r.count,
              tone: r.severity === "high" ? "critical" : r.severity === "medium" ? "accent" : "confident",
            }))}
          />
          {total > 0 && (
            <p className="mt-4 text-xs text-ink-muted">{total} observations in this window.</p>
          )}
        </Panel>
      </div>

      {/* ---- market ----------------------------------------------------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Competitor share of voice"
               hint="Distinct outlets matter more than raw mentions — one talkative rep is not a market movement.">
          {(voice.data?.rows ?? []).length === 0 ? <Empty /> : (
            <div className="space-y-4">
              {(voice.data?.rows ?? []).map((r) => {
                const max = Math.max(1, ...(voice.data?.rows ?? []).map((x) => x.mentions));
                return (
                  <div key={r.competitorBrand}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium">{dir.sku(r.competitorBrand)}</span>
                      <span className="text-ink-muted tabular-nums">
                        {r.mentions} · {r.outletCount} outlet{r.outletCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-line/50 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2
                                      transition-[width] duration-700"
                           style={{ width: `${(r.mentions / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Price movement"
               hint="Reps report changes, not absolute prices — the movement is the signal.">
          {(price.data?.rows ?? []).length === 0 ? <Empty /> : (
            <div className="space-y-3">
              {(price.data?.rows ?? []).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate">{dir.sku(r.skuId ?? r.competitorBrand)}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-ink-muted text-xs tabular-nums">{r.reports} report(s)</span>
                    <span className={`tabular-nums font-semibold ${r.avgDelta < 0 ? "text-critical" : "text-confident"}`}>
                      {formatDelta(r.avgDelta)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Rep coverage"
               hint="Low average confidence usually means dialect, microphone quality or a noisy market — all fixable, and none of them the rep's fault.">
          {(cover.data?.rows ?? []).length === 0 ? <Empty /> : (
            <div className="space-y-4">
              {(cover.data?.rows ?? []).map((r) => (
                <div key={r.repId} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{dir.rep(r.repId)}</p>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {r.clipCount} clips · {r.outletCount} outlets · {r.flagged} flagged
                    </p>
                  </div>
                  <div className="w-32 shrink-0">
                    <ConfidenceBar value={r.avgConfidence} />
                    <p className="mt-1 text-[11px] text-right tabular-nums text-ink-muted">
                      {r.avgConfidence.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, hint, children, className = "" }: {
  title: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`glass p-6 ${className}`}>
      <h2 className="font-display text-lg font-semibold mb-1">{title}</h2>
      {hint ? <p className="text-xs text-ink-muted mb-5 leading-relaxed">{hint}</p> : <div className="mb-5" />}
      {children}
    </section>
  );
}

const Empty = () => <p className="text-sm text-ink-muted py-8 text-center">No data in this window yet.</p>;
