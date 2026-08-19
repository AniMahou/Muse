/** Live level bars arranged in a ring around the record button. */
export function WaveRing({ levels, size, active }: { levels: number[]; size: number; active: boolean }) {
  const cx = size / 2;
  const cy = size / 2;
  const inner = size * 0.38;
  const maxLen = size * 0.09;

  return (
    <svg width={size} height={size} className="absolute inset-0 pointer-events-none" aria-hidden>
      <defs>
        <linearGradient id="wave-g" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="rgb(var(--accent))" />
          <stop offset="1" stopColor="rgb(var(--accent-2))" />
        </linearGradient>
      </defs>
      {levels.map((level, i) => {
        const angle = (i / levels.length) * Math.PI * 2 - Math.PI / 2;
        const len = maxLen * (active ? 0.25 + level * 0.75 : 0.22);
        const x1 = cx + Math.cos(angle) * inner;
        const y1 = cy + Math.sin(angle) * inner;
        const x2 = cx + Math.cos(angle) * (inner + len);
        const y2 = cy + Math.sin(angle) * (inner + len);
        return (
          <line
            key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="url(#wave-g)" strokeWidth="3" strokeLinecap="round"
            opacity={active ? 0.45 + level * 0.55 : 0.25}
            style={{ transition: "opacity 90ms linear" }}
          />
        );
      })}
    </svg>
  );
}

/** Static thumbnail for a queued or past clip. */
export function WaveThumb({ seed, className = "" }: { seed: string; className?: string }) {
  // Deterministic from the id, so a given clip always draws the same shape and
  // the list does not shimmer on every re-render.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bars = Array.from({ length: 14 }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 0.25 + ((h >>> 16) % 100) / 100 * 0.75 * (i % 3 === 0 ? 1 : 0.7);
  });

  return (
    <svg viewBox="0 0 56 24" className={`h-6 w-14 ${className}`} aria-hidden>
      {bars.map((b, i) => (
        <rect
          key={i} x={i * 4} y={12 - (b * 10)} width="2.2" height={b * 20}
          rx="1.1" fill="currentColor" opacity={0.35 + b * 0.5}
        />
      ))}
    </svg>
  );
}
