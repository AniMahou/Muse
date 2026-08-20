/**
 * Small SVG charts.
 *
 * Hand-rolled rather than pulled from a library: four chart types at this size
 * is less code than the configuration a charting library would need, they
 * inherit the theme's CSS variables directly so light and dark work with no
 * extra wiring, and there is no 100KB dependency shipped to a phone.
 */

export function BarChart({ data, height = 180, format }: {
  data: Array<{ label: string; value: number; tone?: "accent" | "confident" | "uncertain" | "critical" }>;
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <Empty />;

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label + i} className="flex-1 flex flex-col items-center gap-2 min-w-0">
          <span className="text-xs tabular-nums text-ink-soft">
            {format ? format(d.value) : d.value}
          </span>
          <div className="w-full rounded-t-lg transition-[height] duration-700"
               style={{
                 height: `${Math.max(3, (d.value / max) * (height - 46))}px`,
                 background: toneGradient(d.tone),
               }} />
          <span className="text-[10px] text-ink-muted truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function AreaChart({ data, height = 160 }: {
  data: Array<{ label: string; value: number; secondary?: number }>;
  height?: number;
}) {
  if (data.length === 0) return <Empty />;
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const w = 100;
  const pt = (v: number, i: number) =>
    `${(i / Math.max(1, data.length - 1)) * w},${100 - (v / max) * 92}`;

  const line = data.map((d, i) => pt(d.value, i)).join(" ");
  const area = `0,100 ${line} ${w},100`;
  const flagged = data.some((d) => d.secondary !== undefined)
    ? data.map((d, i) => pt(d.secondary ?? 0, i)).join(" ")
    : null;

  return (
    <div>
      <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" style={{ height }} className="w-full">
        <defs>
          <linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="rgb(var(--accent))" stopOpacity="0.35" />
            <stop offset="1" stopColor="rgb(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#area-g)" />
        <polyline points={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {flagged && (
          <polyline points={flagged} fill="none" stroke="rgb(var(--uncertain))" strokeWidth="1.4"
                    strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className="flex justify-between mt-2 text-[10px] text-ink-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function Donut({ segments, size = 150 }: {
  segments: Array<{ label: string; value: number; tone: "accent" | "confident" | "uncertain" | "critical" }>;
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <Empty />;

  const r = size / 2 - 14;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        {segments.map((s) => {
          const len = (s.value / total) * circumference;
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="14"
                    stroke={toneVar(s.tone)} strokeDasharray={`${len} ${circumference - len}`}
                    strokeDashoffset={-offset} className="transition-all duration-700" />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="space-y-2 min-w-0 flex-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: toneVar(s.tone) }} />
            <span className="text-ink-soft">{s.label}</span>
            <span className="ml-auto tabular-nums font-medium">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-line/40 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right">
        <span className="font-medium tabular-nums">{value}</span>
        {hint && <span className="block text-[11px] text-ink-muted">{hint}</span>}
      </span>
    </div>
  );
}

/** Marks any figure that is not measured, so nothing on screen overstates. */
export function SimulatedBadge({ label = "simulated" }: { label?: string }) {
  return (
    <span className="rounded-full border border-uncertain/40 bg-uncertain/10 px-2 py-0.5
                     text-[10px] font-medium text-uncertain whitespace-nowrap">
      {label}
    </span>
  );
}

const Empty = () => (
  <p className="text-sm text-ink-muted py-8 text-center">No data in this window yet.</p>
);

function toneVar(t?: string): string {
  return `rgb(var(--${t === "confident" ? "confident" : t === "uncertain" ? "uncertain" : t === "critical" ? "critical" : "accent"}))`;
}
function toneGradient(t?: string): string {
  if (t === "confident") return "rgb(var(--confident))";
  if (t === "uncertain") return "rgb(var(--uncertain))";
  if (t === "critical") return "rgb(var(--critical))";
  return "linear-gradient(180deg, rgb(var(--accent-2)), rgb(var(--accent)))";
}
