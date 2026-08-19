import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Sku } from "@shared/catalog";
import { api } from "@/shared/lib/api";

interface Report {
  kind: string; parsed: number; imported: number;
  skipped: Array<{ row: number; reason: string }>;
}

const TEMPLATES = {
  skus: "skuId,name,brand,pack,manufacturer,isCompetitor\nSKU-100,PRAN Mango Juice,PRAN,250ml,PRAN,false",
  outlets: "outletId,name,lat,lng,territoryId\nOUT-100,Bijoy Store,23.7806,90.4074,T-MIRPUR",
  reps: "repId,name,phone,territoryId,brandPortfolio\nR-100,Rahim Uddin,01700000000,T-MIRPUR,PRAN;Lux",
};

export function Catalog() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<keyof typeof TEMPLATES>("skus");
  const [report, setReport] = useState<Report | null>(null);

  const { data } = useQuery({
    queryKey: ["skus"],
    queryFn: () => api.get<{ skus: Sku[] }>("/admin/catalog/skus?limit=200"),
  });

  const upload = useMutation({
    mutationFn: (csv: string) => api.postText<{ report: Report }>(`/admin/catalog/${kind}`, csv),
    onSuccess: (res) => {
      setReport(res.report);
      void qc.invalidateQueries({ queryKey: ["skus"] });
    },
  });

  async function onFile(file: File) {
    setReport(null);
    upload.mutate(await file.text());
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <h1 className="font-display text-3xl font-bold mb-1">Catalog</h1>
      <p className="text-ink-soft mb-8">
        Muse isn't the system of record — import from your SAP or DMS export.
      </p>

      <div className="flex gap-2 mb-4">
        {(Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>).map((k) => (
          <button key={k} onClick={() => { setKind(k); setReport(null); }}
            className={`rounded-lg px-4 py-2 text-sm capitalize transition-colors ${
              kind === k ? "bg-accent/15 text-accent" : "text-ink-muted hover:text-ink"
            }`}>
            {k}
          </button>
        ))}
      </div>

      <label className="glass block border-dashed border-2 border-line p-10 text-center cursor-pointer
                        hover:border-accent/50 transition-colors mb-4">
        <input type="file" accept=".csv,text/csv" className="sr-only"
               onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
             strokeWidth="1.5" className="mx-auto mb-3 text-accent" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        <p className="font-medium mb-1">
          {upload.isPending ? "Importing…" : `Drop your ${kind} CSV here`}
        </p>
        <p className="text-xs text-ink-muted font-mono">{TEMPLATES[kind].split("\n")[0]}</p>
      </label>

      {report && (
        <div className="glass p-5 mb-8">
          <p className="font-medium mb-2">
            <span className="text-confident">{report.imported} imported</span>
            {report.skipped.length > 0 && (
              <span className="text-uncertain"> · {report.skipped.length} skipped</span>
            )}
            <span className="text-ink-muted"> of {report.parsed} rows</span>
          </p>
          {/* Bad rows are reported, never silently dropped — a 2,000-row file
              with three problems should import 1,997 and tell you which three. */}
          {report.skipped.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-muted">
              {report.skipped.slice(0, 8).map((s) => (
                <li key={s.row}>Row {s.row}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {upload.isError && (
        <div className="glass border-critical/30 bg-critical/10 p-4 mb-8 text-sm text-critical">
          {(upload.error as Error).message}
        </div>
      )}

      <h2 className="font-display text-lg font-semibold mb-4">
        Products <span className="text-ink-muted font-normal">({data?.skus.length ?? 0})</span>
      </h2>
      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr className="border-b border-line/50">
              <th className="px-5 py-3 font-medium">SKU</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Brand</th>
              <th className="px-5 py-3 font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {(data?.skus ?? []).map((s) => (
              <tr key={s.skuId} className="border-b border-line/30 last:border-0">
                <td className="px-5 py-3 font-mono text-xs text-ink-muted">{s.skuId}</td>
                <td className="px-5 py-3 font-medium">{s.name}</td>
                <td className="px-5 py-3">{s.brand}</td>
                <td className="px-5 py-3">
                  {s.isCompetitor
                    ? <span className="text-uncertain text-xs">competitor</span>
                    : <span className="text-ink-muted text-xs">own</span>}
                </td>
              </tr>
            ))}
            {(data?.skus ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-ink-muted">
                No products yet. Import a CSV above.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
