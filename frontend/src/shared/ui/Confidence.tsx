/**
 * Confidence, shown three ways.
 *
 * These components carry the product's central claim into the interface: the
 * system knows when it does not know. The colour thresholds are shared so a
 * ring, a bar and a dot can never disagree about the same number.
 *
 * Amber, never red. A flagged field is the system being honest, not an error.
 */
export function confidenceTone(value: number): "high" | "mid" | "low" {
  if (value >= 0.8) return "high";
  if (value >= 0.6) return "mid";
  return "low";
}

const TONE_CLASS = {
  high: "text-confident",
  mid: "text-uncertain",
  low: "text-critical",
} as const;

export function ConfidenceRing({ value, size = 44 }: { value: number; size?: number }) {
  const tone = confidenceTone(value);
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth="3"
                className="stroke-line" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} strokeWidth="3" fill="none"
          strokeLinecap="round"
          className={`${TONE_CLASS[tone]} transition-[stroke-dashoffset] duration-700`}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
        />
      </svg>
      <span className={`absolute text-[11px] font-semibold tabular-nums ${TONE_CLASS[tone]}`}>
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const tone = confidenceTone(value);
  return (
    <div className="h-1.5 w-full rounded-full bg-line/60 overflow-hidden">
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${
          tone === "high" ? "bg-confident" : tone === "mid" ? "bg-uncertain" : "bg-critical"
        }`}
        style={{ width: `${Math.max(2, value * 100)}%` }}
      />
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-confident/15 text-confident border-confident/30",
    needs_clarification: "bg-uncertain/15 text-uncertain border-uncertain/30",
    corrected: "bg-accent/15 text-accent border-accent/30",
    discarded: "bg-line/40 text-ink-muted border-line",
    processed: "bg-confident/15 text-confident border-confident/30",
    processing: "bg-uncertain/15 text-uncertain border-uncertain/30",
    queued: "bg-line/40 text-ink-muted border-line",
    failed: "bg-critical/15 text-critical border-critical/30",
  };
  const label: Record<string, string> = {
    needs_clarification: "needs review",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1
                      text-[11px] font-medium ${map[status] ?? map.queued}`}>
      {label[status] ?? status}
    </span>
  );
}
