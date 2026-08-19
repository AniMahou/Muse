import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Observation } from "@shared/observation.schema";
import { api } from "@/shared/lib/api";
import { ConfidenceBar, ConfidenceRing } from "@/shared/ui/Confidence";

/**
 * HQ review of flagged records.
 *
 * The transcript is shaded by per-field confidence so a reviewer can see WHERE
 * to look before they listen, which is the difference between reviewing a
 * queue and wading through it.
 */
export function Review() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["review"],
    queryFn: () => api.get<{ observations: Observation[] }>("/admin/review?limit=50"),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/admin/observations/${id}/correct`, { patch: {} }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["review"] }),
  });

  const rows = data?.observations ?? [];
  const current = rows.find((o) => o.observationId === selected) ?? rows[0];

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;

  if (rows.length === 0) {
    return (
      <div className="glass p-12 text-center max-w-lg mx-auto mt-10">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-confident/15 grid place-items-center">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
               strokeWidth="2" className="text-confident" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="font-display text-lg font-semibold mb-1">Nothing to review</p>
        <p className="text-sm text-ink-muted">
          Every observation cleared its confidence thresholds.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-bold mb-1">Review</h1>
      <p className="text-ink-soft mb-8">
        {rows.length} record{rows.length === 1 ? "" : "s"} the system was not sure about.
      </p>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {rows.map((o) => {
            const conf = mean(Object.values(o.fieldConfidence));
            const active = current?.observationId === o.observationId;
            return (
              <button key={o.observationId} onClick={() => setSelected(o.observationId)}
                className={`w-full glass p-4 text-left transition-all
                            ${active ? "border-accent/60" : "hover:border-accent/30"}`}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-xs text-ink-muted tabular-nums">
                    {new Date(o.recordedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <ConfidenceRing value={conf} size={34} />
                </div>
                <p className="font-bn text-sm line-clamp-2 text-ink-soft">{o.verbatimBn}</p>
                <p className="mt-2 text-[11px] text-uncertain">
                  {o.flaggedFields.length} field{o.flaggedFields.length === 1 ? "" : "s"} unconfirmed
                </p>
              </button>
            );
          })}
        </div>

        {current && (
          <div className="glass p-7">
            <p className="label">Transcript</p>
            <p className="font-bn text-2xl leading-loose mb-8">{current.verbatimBn}</p>

            <p className="label">Extracted</p>
            <div className="space-y-4 mb-8">
              {(["outletId", "skuId", "competitorBrand", "quantity", "priceDelta", "severity"] as const)
                .filter((f) => current[f] !== null && current[f] !== undefined)
                .map((f) => {
                  const conf = current.fieldConfidence[f] ?? 1;
                  const flagged = current.flaggedFields.includes(f);
                  return (
                    <div key={f}>
                      <div className="flex items-center justify-between gap-4 mb-1.5">
                        <span className="text-sm text-ink-muted">{labelFor(f)}</span>
                        <span className={`text-sm font-medium ${flagged ? "text-uncertain" : ""}`}>
                          {String(current[f])}
                          {flagged && <span className="ml-2 text-xs">unconfirmed</span>}
                        </span>
                      </div>
                      <ConfidenceBar value={conf} />
                    </div>
                  );
                })}
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn-primary"
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate(current.observationId)}>
                Confirm as correct
              </button>
              <button className="btn-ghost" disabled>Correct…</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelFor = (f: string) =>
  ({ outletId: "Outlet", skuId: "Product", competitorBrand: "Competitor",
     quantity: "Quantity", priceDelta: "Price change", severity: "Severity" }[f] ?? f);

const mean = (n: number[]) => (n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0);
