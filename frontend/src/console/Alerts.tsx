import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Alert } from "@shared/alert.schema";
import { api } from "@/shared/lib/api";
import { useDirectory } from "./lib/directory";
import { onAlertRaised, onAlertUpdated } from "./lib/socket";

interface Stats {
  raised: number;
  open: number;
  answered: number;
  medianResponseSec: number | null;
}

const KIND_LABEL: Record<Alert["kind"], string> = {
  competitor_promo: "Competitor promotion",
  stock_out: "Stock-out",
  price_change: "Price change",
};

/**
 * The action queue.
 *
 * Everything else in this console reports what happened. This is the only
 * screen that asks somebody to do something, which is why it sits above the
 * feed rather than beside it — an alert that has to be scrolled to is a
 * dashboard entry, not an alert.
 */
export function AlertPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const dir = useDirectory();
  const [flash, setFlash] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api.get<{ alerts: Alert[] }>("/admin/alerts?limit=50"),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const offRaised = onAlertRaised((a) => {
      // Briefly mark the new one, then let it settle into the list. A row that
      // simply appears mid-page is easy to miss on a projector.
      setFlash(a.alertId);
      setTimeout(() => setFlash((f) => (f === a.alertId ? null : f)), 6000);
      void qc.invalidateQueries({ queryKey: ["alerts"] });
    });
    const offUpdated = onAlertUpdated(() => void qc.invalidateQueries({ queryKey: ["alerts"] }));
    return () => { offRaised(); offUpdated(); };
  }, [qc]);

  const respond = useMutation({
    mutationFn: (v: { id: string; status: "acknowledged" | "dismissed" }) =>
      api.post(`/admin/alerts/${v.id}/respond`, { status: v.status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["alert-stats"] });
    },
  });

  const alerts = data?.alerts ?? [];
  const open = alerts.filter((a) => a.status === "open");
  const shown = compact ? open.slice(0, 3) : alerts;

  if (compact && open.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <span className={`h-2 w-2 rounded-full ${open.length ? "bg-critical animate-pulse" : "bg-confident"}`} />
        <h2 className="font-display text-lg font-semibold">
          Needs a decision
        </h2>
        {open.length > 0 && (
          <span className="rounded-md bg-critical/15 text-critical px-2 py-0.5 text-[11px] font-medium">
            {open.length} open
          </span>
        )}
      </div>

      {shown.length === 0 && (
        <div className="glass p-8 text-center text-ink-muted text-sm">
          Nothing needs a decision. An alert is raised when several outlets independently
          report the same thing.
        </div>
      )}

      <div className="space-y-3">
        {shown.map((a) => (
          <AlertCard
            key={a.alertId}
            a={a}
            flash={flash === a.alertId}
            label={a.kind === "competitor_promo" ? dir.sku(a.key) : dir.sku(a.key)}
            outletNames={a.outletIds.map((id) => dir.outlet(id))}
            busy={respond.isPending}
            onRespond={(status) => respond.mutate({ id: a.alertId, status })}
          />
        ))}
      </div>
    </section>
  );
}

function AlertCard({
  a, label, outletNames, onRespond, busy, flash,
}: {
  a: Alert;
  label: string;
  outletNames: string[];
  onRespond: (s: "acknowledged" | "dismissed") => void;
  busy: boolean;
  flash: boolean;
}) {
  const isOpen = a.status === "open";
  const shownOutlets = outletNames.slice(0, 4);
  const more = outletNames.length - shownOutlets.length;

  return (
    <div className={`glass p-5 animate-fade-up
                     ${isOpen ? "border-l-2 border-l-critical" : "opacity-70"}
                     ${flash ? "ring-1 ring-critical/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="rounded-md bg-critical/15 text-critical px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
          {KIND_LABEL[a.kind]}
        </span>
        <span className="rounded-md bg-raised px-2 py-0.5 text-[11px] text-ink-soft">
          {a.outletIds.length} outlets
        </span>
        {!isOpen && (
          <span className="rounded-md bg-confident/15 text-confident px-2 py-0.5 text-[11px] font-medium">
            {a.status} · {formatGap(a)}
          </span>
        )}
      </div>

      <p className="text-base font-medium text-ink mb-1">{label}</p>
      <p className="text-sm text-ink-soft mb-3">
        {shownOutlets.join(" · ")}{more > 0 && ` · +${more} more`}
      </p>
      <p className="text-xs text-ink-muted mb-4">
        First reported {relative(a.firstSeenAt)} · raised {relative(a.raisedAt)}
      </p>

      {isOpen && (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => onRespond("acknowledged")}
            className="rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Acknowledge
          </button>
          <button
            disabled={busy}
            onClick={() => onRespond("dismissed")}
            className="rounded-xl glass px-4 py-2 text-sm text-ink-soft disabled:opacity-50"
          >
            Not actionable
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Median time to respond.
 *
 * The number a pilot is scored on. Muse does not fix a stock-out — that is the
 * distributor's job — it compresses how long it takes anyone to know, and both
 * ends of this clock are inside the system.
 */
export function ResponseStat() {
  const { data } = useQuery({
    queryKey: ["alert-stats"],
    queryFn: () => api.get<Stats>("/admin/alerts/stats"),
    refetchInterval: 60_000,
  });

  return (
    <div className="glass px-4 py-4">
      <p className="text-[11px] uppercase tracking-wider text-ink-muted mb-2">
        Median response
      </p>
      <p className="stat-number text-3xl text-ink">
        {data?.medianResponseSec == null ? "—" : formatDuration(data.medianResponseSec)}
      </p>
      <p className="text-[11px] text-ink-muted mt-1">
        {data?.answered ?? 0} answered · {data?.open ?? 0} open
      </p>
    </div>
  );
}

function formatGap(a: Alert): string {
  if (!a.acknowledgedAt) return "—";
  return formatDuration((Date.parse(a.acknowledgedAt) - Date.parse(a.raisedAt)) / 1000);
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

function relative(iso: string): string {
  const sec = (Date.now() - Date.parse(iso)) / 1000;
  if (sec < 90) return "just now";
  return `${formatDuration(sec)} ago`;
}

/** The full queue, including everything already answered. */
export function AlertsPage() {
  return (
    <div className="max-w-[1400px] mx-auto">
      <h1 className="font-display text-3xl font-bold mb-1">Alerts</h1>
      <p className="text-ink-soft mb-8">
        Raised when several outlets independently report the same thing. One rep is an
        anecdote; agreement across shops is a market event.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <ResponseStat />
      </div>

      <AlertPanel />
    </div>
  );
}
