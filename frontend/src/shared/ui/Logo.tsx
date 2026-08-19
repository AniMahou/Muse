export function Logo({ size = 32, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
        <defs>
          <linearGradient id="muse-g" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="rgb(var(--accent))" />
            <stop offset="1" stopColor="rgb(var(--accent-2))" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#muse-g)" />
        {/* A waveform resolving into even bars: voice becoming data, which is
            the entire product in one mark. */}
        <g stroke="white" strokeWidth="2.4" strokeLinecap="round">
          <path d="M11 20v0" opacity=".55" />
          <path d="M15 15v10" opacity=".75" />
          <path d="M20 11v18" />
          <path d="M25 16v8" opacity=".75" />
          <path d="M29 18v4" opacity=".55" />
        </g>
      </svg>
      {withText && (
        <span className="font-display text-xl font-bold tracking-tight">Muse</span>
      )}
    </div>
  );
}
