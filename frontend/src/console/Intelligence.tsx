import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/lib/api";

interface Voice { competitorBrand: string; mentions: number; outletCount: number; highSeverity: number }
interface Price { skuId: string | null; competitorBrand: string | null; avgDelta: number; minDelta: number; reports: number; outletCount: number }
interface Coverage { repId: string; observations: number; clipCount: number; outletCount: number; flagged: number; avgConfidence: number }
interface TypeRow { type: string; severity: string; count: number }

export function Intelligence() {
  const q = <T,>(key: string, path: string) =>
    useQuery({ queryKey: [key], queryFn: () => api.get<{ rows: T[] }>(path) });

  const voice = q<Voice>("sov", "/admin/analytics/share-of-voice");
  const price = q<Price>("price", "/admin/analytics/price-erosion");
  const cover = q<Coverage>("coverage", "/admin/analytics/rep-coverage");
  const types = q<TypeRow>("types", "/admin/analytics/types");

  const maxMentions = Math.max(1, ...(voice.data?.rows ?? []).map((r) => r.mentions));
  const maxType = Math.max(1, ...(types.data?.rows ?? []).map((r) => r.count));

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-bold mb-1">Intelligence</h1>
      <p className="text-ink-soft mb-8">What the field has been telling you.</p>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Competitor share of voice"
               hint="Distinct outlets matter more than raw mentions — one talkative rep is not a market movement.">
          {(voice.data?.rows ?? []).length === 0 && <Empty />}
          <div className="space-y-4">
            {(voice.data?.rows ?? []).map((r) => (
              <div key={r.competitorBrand}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium">{r.competitorBrand}</span>
                  <span className="text-ink-muted tabular-nums">
                    {r.mentions} · {r.outletCount} outlet{r.outletCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-line/50 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2
                                  transition-[width] duration-700"
                       style={{ width: `${(r.mentions / maxMentions) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Price movement"
               hint="Reps report changes, not absolute prices — the movement is the signal.">
          {(price.data?.rows ?? []).length === 0 && <Empty />}
          <div className="space-y-3">
            {(price.data?.rows ?? []).map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate">{r.skuId ?? r.competitorBrand ?? "—"}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-ink-muted text-xs tabular-nums">{r.reports} report(s)</span>
                  <span className={`tabular-nums font-semibold ${
                    r.avgDelta < 0 ? "text-critical" : "text-confident"
                  }`}>
                    ৳{r.avgDelta}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="What is being reported">
          {(types.data?.rows ?? []).length === 0 && <Empty />}
          <div className="space-y-4">
            {(types.data?.rows ?? []).map((r, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="capitalize">{r.type.replace(/_/g, " ")}</span>
                  <span className="text-ink-muted tabular-nums">{r.count}</span>
                </div>
                <div className="h-2 rounded-full bg-line/50 overflow-hidden">
                  <div className={`h-full rounded-full ${
                    r.severity === "high" ? "bg-critical" : r.severity === "medium" ? "bg-accent" : "bg-ink-muted"
                  }`} style={{ width: `${(r.count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Rep coverage"
               hint="Low average confidence usually means dialect, microphone quality or a noisy market — all fixable.">
          {(cover.data?.rows ?? []).length === 0 && <Empty />}
          <div className="space-y-4">
            {(cover.data?.rows ?? []).map((r) => (
              <div key={r.repId} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.repId}</p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {r.clipCount} clips · {r.outletCount} outlets · {r.flagged} flagged
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <div className="h-2 rounded-full bg-line/50 overflow-hidden">
                    <div className={`h-full rounded-full ${
                      r.avgConfidence >= 0.8 ? "bg-confident"
                      : r.avgConfidence >= 0.6 ? "bg-uncertain" : "bg-critical"
                    }`} style={{ width: `${r.avgConfidence * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-right tabular-nums text-ink-muted">
                    {r.avgConfidence.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="glass p-6">
      <h2 className="font-display text-lg font-semibold mb-1">{title}</h2>
      {hint && <p className="text-xs text-ink-muted mb-5 leading-relaxed">{hint}</p>}
      {!hint && <div className="mb-5" />}
      {children}
    </section>
  );
}

const Empty = () => <p className="text-sm text-ink-muted py-6 text-center">No data in this window yet.</p>;
