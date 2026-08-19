import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AliasCandidate } from "@shared/clarification.schema";
import { api } from "@/shared/lib/api";

/**
 * The learning loop, made visible.
 *
 * A surface form the resolver could not place, the product it thinks was
 * meant, and one decision. Approving writes an alias, and the resolver stops
 * being uncertain about that word — permanently, for every rep in the company.
 */
export function Aliases() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["aliases"],
    queryFn: () => api.get<{ candidates: AliasCandidate[] }>("/admin/aliases/pending"),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject" }) =>
      api.post(`/admin/aliases/${v.id}/${v.action}`, { reviewedBy: "console" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["aliases"] }),
  });

  const rows = data?.candidates ?? [];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="font-display text-3xl font-bold mb-2">Teach Muse</h1>
        <p className="text-ink-soft">Approve once. It never asks again.</p>
      </div>

      {isLoading && <p className="text-center text-ink-muted">Loading…</p>}

      {!isLoading && rows.length === 0 && (
        <div className="glass p-12 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-confident/15 grid place-items-center">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
                 strokeWidth="2" className="text-confident" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="font-display text-lg font-semibold mb-1">Muse has nothing to ask</p>
          <p className="text-sm text-ink-muted">
            Every product mention so far resolved confidently.
          </p>
        </div>
      )}

      <div className="space-y-5">
        {rows.map((c) => (
          <div key={c.candidateId} className="glass p-7 animate-fade-up">
            <div className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-6">
              <div>
                <p className="label">Heard</p>
                <p className="font-bn text-4xl mb-3">{c.surface}</p>
                <span className="inline-flex items-center gap-2 rounded-full bg-raised/60
                                 border border-line px-3 py-1 text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  heard {c.occurrences}×
                </span>
              </div>

              <div className="hidden md:grid place-items-center h-10 w-10 rounded-full
                              bg-gradient-to-br from-accent to-accent-2 text-white">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>

              <div>
                <p className="label">Muse suggests</p>
                <p className="font-display text-2xl font-semibold mb-1">
                  {c.suggestedName ?? "—"}
                </p>
                <p className="font-mono text-xs text-ink-muted mb-3">{c.suggestedSkuId ?? "no match"}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-ink-muted">score</span>
                  <span className="tabular-nums font-medium">{c.bestScore.toFixed(2)}</span>
                  <span className="text-ink-muted">margin</span>
                  <span className={`tabular-nums font-medium ${
                    c.bestMargin < 0.15 ? "text-uncertain" : "text-confident"
                  }`}>
                    {c.bestMargin.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-7 pt-5 border-t border-line/50 flex flex-wrap gap-3">
              <button className="btn-primary"
                      disabled={decide.isPending || !c.suggestedSkuId}
                      onClick={() => decide.mutate({ id: c.candidateId, action: "approve" })}>
                Approve mapping
              </button>
              <button className="btn-ghost"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ id: c.candidateId, action: "reject" })}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
